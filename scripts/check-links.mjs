import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parse } from "node-html-parser";
import MarkdownIt from "markdown-it";
import { auditProject, listFiles, createFileInspector } from "./check-content.mjs";

const walk = (node, visit) => { visit(node); for (const child of node.children || []) walk(child, visit); };
const withoutFragment = value => { try { const url=new URL(value);url.hash="";return url.href; } catch { return value; } };
const linkify = new MarkdownIt({ linkify: true }).linkify;
export function sourceLinks(articles) {
	const links = [];
	for (const article of articles) {
		const definitions = new Map();
		walk(article.tree, node => { if (node.type === "definition") definitions.set(node.identifier, node.url); });
		const add = (url, node) => { if (url) links.push({ url, file: article.file, line: (node.position?.start.line || 1) + article.offset }); };
		walk(article.tree, node => {
			if (node.type === "text") for (const match of linkify.match(node.value) || []) if (/^(?:https?:\/\/|www\.)/i.test(match.text)) add(match.url,node);
			if (["link", "linkReference", "image", "imageReference"].includes(node.type)) add(node.url || definitions.get(node.identifier), node);
			if (node.type === "html") for (const element of parse(node.value).querySelectorAll("a[href],img[src]")) add(element.getAttribute("href") || element.getAttribute("src"), node);
			if (node.type === "leafDirective" && node.name === "baidu") add(node.attributes?.url, node);
			if (node.type === "leafDirective" && node.name === "github") add(`https://github.com/${node.attributes?.repo}`, node);
		});
	}
	return links.filter((item,index) => links.findIndex(other=>other.url===item.url && other.file===item.file && other.line===item.line)===index);
}

export async function auditRenderedLinks(pages, load) {
	const issues = [], external = new Set(); let count = 0;
	const cache = new Map(pages.map(page => [new URL(page.url).href, Promise.resolve({ status: 200, type: "text/html", html: page.html })]));
	for (const page of pages) {
		const document = parse(page.html);
		for (const link of document.querySelectorAll(".markdown-content a[href], .custom-md a[href]")) {
			const href = link.getAttribute("href");
			if (/^(?:mailto:|tel:)/i.test(href)) continue;
			count++;
			try {
				const target = new URL(href, page.url);
				assert.ok(["http:", "https:"].includes(target.protocol), "Unsupported link protocol");
				if (target.origin !== new URL(page.url).origin) { target.hash = ""; external.add(target.href); continue; }
				const fragment = decodeURIComponent(target.hash.slice(1)).split(":~:text=", 1)[0];
				target.hash = ""; target.search = "";
				if (!cache.has(target.href)) cache.set(target.href, load(target));
				const result = await cache.get(target.href);
				assert.equal(result.status, 200, `HTTP ${result.status}: destination missing or inaccessible`);
				if (fragment && result.type.includes("text/html")) {
					const html = parse(result.html);
					assert.ok(html.querySelectorAll("[id],a[name]").some(element => element.id === fragment || element.getAttribute("name") === fragment), `Missing chapter #${fragment}`);
				}
			} catch (error) { issues.push({ page: page.url, href, message: error.message }); }
		}
	}
	return { pages: pages.length, links: count, targets: cache.size, issues, external: [...external].sort() };
}

export async function probeExternal(url, request = fetch) {
	try {
		const target = new URL(url);
		if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) throw new Error("Unsupported URL or embedded credentials");
		const get = method => request(url, { method, redirect: "follow", signal: AbortSignal.timeout(10000), headers: { "user-agent": "AsroundBlog-LinkCheck/1.0", ...(method === "GET" ? { Range: "bytes=0-1023" } : {}) } });
		let response = await get("HEAD");
		await response.body?.cancel();
		// Confirm missing responses using GET; many sites reject automated HEAD requests.
		if ([401,403,404,405,410,429,500,501,502,503,504].includes(response.status)) { response = await get("GET"); await response.body?.cancel(); }
		const status = response.status;
		const classification = response.ok ? response.redirected ? "redirect" : "ok" : [404,410].includes(status) ? "missing" : [401,403,405,429].includes(status) ? "restricted" : "transient";
		return { url, status, classification, finalUrl: response.url || url };
	} catch (error) { return { url, status: null, classification: "transient", message: error.cause?.code || error.message }; }
}

export async function checkLinks({ built, base, external = false, externalOnly = false, report }) {
	const audit = await auditProject();
	assert.equal(audit.issues.filter(issue => issue.level === "error").length, 0, "Content audit must pass");
	let local;
	if (!externalOnly) {
		const origin = "https://asround-blog.pages.dev";
		const inspect = createFileInspector();
		const load = async target => {
			if (!built) {
				const response = await fetch(new URL(target.pathname + target.search, base), { signal: AbortSignal.timeout(15000) });
				const type = response.headers.get("content-type") || "";
				const html = type.includes("text/html") ? await response.text() : "";
				if (!html) await response.body?.cancel();
				return { status: response.status, type, html };
			}
			const root = path.resolve(built);
			let file = path.resolve(root, "." + decodeURIComponent(target.pathname));
			assert.ok(file === root || file.startsWith(root + path.sep), "Destination outside build directory");
			try {
				if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
				const status = await inspect(file);
				if (status !== "ok") return { status: 404, type: "", html: "" };
				const html = file.endsWith(".html") ? await readFile(file, "utf8") : "";
				return { status: 200, type: html ? "text/html" : "application/octet-stream", html };
			} catch (error) { if (["ENOENT","ENOTDIR"].includes(error.code)) return { status: 404, type: "", html: "" }; throw error; }
		};
		let routes;
		if (built) routes = (await listFiles(built)).filter(file=>file.endsWith(".html")).map(file => "/" + file.replace(/index\.html$/, ""));
		else routes = [...new Set(audit.articles.filter(post=>!post.data.draft).flatMap(post=>post.paths).concat(["/about/", "/rss/"]))];
		const pages = [];
		for (const route of routes) { const result = await load(new URL(route, origin)); assert.equal(result.status,200,route); pages.push({ url:new URL(route,origin).href,html:result.html }); }
		local = await auditRenderedLinks(pages, load);
		for (const issue of local.issues) console.log(`LINK ERROR ${JSON.stringify(issue)}`);
		console.log(`LINKS ${local.pages} pages, ${local.links} article links, ${local.issues.length} errors`);
	}
	let remote = [];
	if (external || externalOnly) {
		const refs = sourceLinks(audit.articles).filter(item=>/^https?:\/\//i.test(item.url) && !item.url.startsWith("https://asround-blog.pages.dev/"));
		const urls = [...new Set(refs.map(item => withoutFragment(item.url)).concat(local?.external || []))].sort();
		for (let start=0; start<urls.length; start+=3) {
			const batch = await Promise.all(urls.slice(start,start+3).map(url=>probeExternal(url)));
			for (const item of batch) { item.references=refs.filter(ref=>withoutFragment(ref.url)===item.url); console.log(`EXTERNAL ${JSON.stringify(item)}`); }
			remote.push(...batch);
		}
	}
	const output = { schema:1, checkedAt:new Date().toISOString(), local, external:remote, summary:Object.fromEntries(["ok","redirect","missing","restricted","transient"].map(key=>[key,remote.filter(item=>item.classification===key).length])) };
	if (report) await writeFile(report,JSON.stringify(output,null,2)+"\n");
	assert.equal(local?.issues.length || 0,0,"Broken internal article links or chapter anchors; see LINK ERROR output");
	return output;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
	const args=process.argv.slice(2), get=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
	await checkLinks({built:get("built") || (!get("base") && !args.includes("--external-only") ? "dist" : undefined), base:get("base"), external:args.includes("--external"),externalOnly:args.includes("--external-only"),report:get("report")});
}
