import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "node-html-parser";
import sharp from "sharp";
import { chromium } from "playwright-core";
import { auditProject, listFiles } from "./check-content.mjs";

export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const walk = (node, visit) => { visit(node); for (const child of node.children || []) walk(child, visit); };
export function imageReferences(article) {
	const result = [];
	const add = (url, kind, node) => result.push({ url, kind, node, file: /^(?:https?:|data:|\/\/)/i.test(url) ? null
		: url.startsWith("/") ? "public/" + decodeURIComponent(url.slice(1).split(/[?#]/, 1)[0])
		: path.posix.normalize(path.posix.join(path.posix.dirname(article.file), decodeURIComponent(url.split(/[?#]/, 1)[0]))) });
	if (article.data.image) add(article.data.image, "cover");
	const definitions = new Map();
	walk(article.tree, node => { if (node.type === "definition") definitions.set(node.identifier, node.url); });
	walk(article.tree, node => {
		if (node.type === "image" || node.type === "imageReference") add(node.url || definitions.get(node.identifier), "body", node);
		if (node.type === "html") for (const img of parse(node.value).querySelectorAll("img[src]")) add(img.getAttribute("src"), "body", node);
	});
	return result;
}
export async function imageSnapshot() {
	const { articles, issues } = await auditProject();
	assert.equal(issues.filter(issue => issue.level === "error").length, 0, "Content audit must pass");
	const files = [];
	for (const name of (await listFiles("src/content/posts")).filter(file => /\.(?:png|jpe?g|webp|gif|svg)$/i.test(file))) {
		const file = "src/content/posts/" + name;
		files.push({ file, hash: hash(await readFile(file)) });
	}
	const hashes = new Map(files.map(item => [item.file, item.hash]));
	const posts = articles.map(article => ({ file: article.file, paths: article.paths, draft: article.data.draft,
		references: imageReferences(article).map(({ url, kind, file }) => ({ url, kind, file, hash: hashes.get(file) || null })) }));
	return { files, posts };
}

export async function checkRenderedImages({ base, built, snapshot }) {
	snapshot ||= await imageSnapshot();
	const root = built ? path.resolve(built) : null;
	const cache = new Map();
	const origin = base || "https://asround-blog.pages.dev";
	const read = async address => {
		let url = new URL(address, origin);
		if (!built && url.origin === "https://asround-blog.pages.dev") url = new URL(url.pathname + url.search, base);
		if (root) {
			assert.equal(url.origin, new URL(origin).origin, `Unexpected external image: ${address}`);
			const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
			assert.ok(file.startsWith(root + path.sep));
			return readFile(file);
		}
		const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
		assert.ok(response.ok, `HTTP ${response.status}: ${url}`);
		assert.ok(response.headers.get("content-type")?.startsWith("image/"), `Not an image: ${url}`);
		return Buffer.from(await response.arrayBuffer());
	};
	const resource = address => {
		const key = new URL(address, origin).href;
		if (!cache.has(key)) cache.set(key, (async () => {
			const bytes = await read(address);
			const metadata = await sharp(bytes).metadata();
			assert.ok(metadata.width && metadata.height, `Missing image dimensions: ${address}`);
			await sharp(bytes).raw().toBuffer(); // Decode the whole image, not only its header.
			return { hash: hash(bytes), width: metadata.width, height: metadata.height, format: metadata.format };
		})());
		return cache.get(key);
	};
	let pages = 0, references = 0;
	const browser = !built ? await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true }) : null;
	try {
		for (const post of snapshot.posts.filter(post => !post.draft)) {
			for (const route of post.paths) {
				let html;
				if (built) html = await readFile(path.join(root, decodeURIComponent(route), "index.html"), "utf8");
				else { const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(30000) }); assert.ok(response.ok, `Article HTTP ${response.status}: ${route}`); html = await response.text(); }
				const document = parse(html);
				const body = document.querySelectorAll("#post-container .markdown-content img");
				const cover = document.querySelector("#post-cover img");
				const images = cover ? [cover, ...body] : body;
				assert.equal(images.length, post.references.length, `Image count: ${route}`);
				for (let index = 0; index < images.length; index++) {
					const image = images[index], reference = post.references[index];
					assert.ok(reference.hash, `Expected a local verifiable source: ${reference.url}`);
					const original = image.getAttribute("data-original-src") || image.getAttribute("src");
					assert.equal((await resource(original)).hash, reference.hash, `Wrong original image at ${route} #${index}: ${original}`);
					const candidates = [image.getAttribute("src"), image.getAttribute("data-print-src"), ...(image.getAttribute("srcset") || "").split(/,\s+/).filter(Boolean).map(item => item.replace(/\s+\d+[wx]$/, ""))].filter(Boolean);
					for (const candidate of new Set(candidates)) await resource(candidate);
					references++;
				}
				if (browser) {
					const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
					try {
						await page.route(/https:\/\/(?:giscus\.app|www\.clarity\.ms|www\.googletagmanager\.com)\//, route => route.abort());
						await page.goto(new URL(route, base).href, { waitUntil: "domcontentloaded" });
						await page.locator("#post-container .markdown-content img, #post-cover img").evaluateAll(async images => {
							for (const image of images) image.loading = "eager";
							await Promise.all(images.map(image => image.decode()));
							if (images.some(image => !image.naturalWidth)) throw new Error("Undecodable image");
						});
					} finally { await page.close(); }
				}
				pages++;
				console.log(`Checked ${route}: ${images.length} images`);
			}
		}
		// Feed HTML is escaped in Atom and wrapped in CDATA in RSS.
		let feedImages = 0;
		const expectedFeeds = new Map();
		const decodeContent = content => content.startsWith("<![CDATA[") ? content.slice(9,-3).replaceAll("]]]]><![CDATA[>", "]]>") : parse("<div>"+content+"</div>").textContent;
		for (const endpoint of ["rss.xml", "atom.xml"]) {
			const xml = built ? await readFile(path.join(root, endpoint), "utf8") : await (await fetch(new URL(endpoint, base))).text();
			const rss = endpoint === "rss.xml";
			const entries = [...xml.matchAll(rss ? /<item>([\s\S]*?)<\/item>/g : /<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
			assert.equal(entries.length, snapshot.posts.filter(post => !post.draft).length, `${endpoint} entries`);
			const expected = snapshot.posts.filter(post => !post.draft).reduce((sum, post) => sum + post.references.filter(ref => ref.kind === "body").length, 0);
			let count = 0;
			for (const entry of entries) {
				const link = rss ? decodeContent(entry.match(/<link>([\s\S]*?)<\/link>/)[1]) : parse(entry).querySelector('link[rel="alternate"]').getAttribute("href");
				const route = new URL(link).pathname;
				const post = snapshot.posts.find(post => post.paths.includes(route)); assert.ok(post, `Unknown feed article: ${link}`);
				const content = decodeContent(entry.match(rss ? /<content:encoded>([\s\S]*?)<\/content:encoded>/ : /<content\b[^>]*>([\s\S]*?)<\/content>/)[1]);
				const images = parse(content).querySelectorAll("img[src]");
				const refs = post.references.filter(ref => ref.kind === "body");
				assert.equal(images.length, refs.length, `${endpoint} image count: ${link}`);
				for (let index=0;index<images.length;index++) {
					const actual = await resource(images[index].getAttribute("src"));
					const ref = refs[index];
					const key = `${ref.file}:${actual.format}:${actual.width}`;
					if (!expectedFeeds.has(key)) expectedFeeds.set(key, (async () => {
						const bytes = await readFile(ref.file);
						if (actual.format === "svg") return hash(bytes);
						return hash(await sharp(bytes, {pages:-1}).rotate().resize({width:actual.width}).toFormat(actual.format).toBuffer());
					})());
					assert.equal(actual.hash, await expectedFeeds.get(key), `${endpoint} wrong source image: ${link} #${index}`);
					count++;
				}
			}
			assert.equal(count, expected, `${endpoint} body image count`); feedImages += count;
		}
		console.log(`PASS image integrity: ${snapshot.files.length} source images, ${pages} article routes, ${references} rendered references, ${feedImages} feed images, ${cache.size} unique decoded resources, 0 failures`);
		return { pages, references, feedImages, resources: cache.size };
	} finally { await browser?.close(); }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	const built = process.argv.find(arg => arg.startsWith("--built="))?.slice(8);
	await checkRenderedImages({ built, base: built ? undefined : process.argv[2] || "http://localhost:4321" });
}
