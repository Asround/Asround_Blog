import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";
import { parse } from "node-html-parser";
import * as pagefind from "pagefind";
import { auditProject } from "./check-content.mjs";
import { readCommentConfig } from "./check-comments.mjs";

// 使用正在运行的开发预览；索引只在内存中生成，不构建站点或写入 dist。
const base = process.argv[2] || "http://localhost:4321";
const rssRequire = createRequire(import.meta.resolve("@astrojs/rss/package.json"));
const { XMLParser, XMLValidator } = rssRequire("fast-xml-parser");
async function get(path) {
	const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(60000) });
	assert.equal(response.status, 200, path);
	return response.text();
}

// 限制并发，避免全站图片检查挤满开发服务的图片处理队列。
async function mapLimit(items, limit, task) {
	const results = [];
	for (let start = 0; start < items.length; start += limit) {
		results.push(...await Promise.all(items.slice(start, start + limit).map(task)));
	}
	return results;
}

const source = await readFile(new URL("../src/utils/search-utils.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { deduplicateSearchResults, findSearchArticle, matchesSearchText,
	highlightSearchText, matchingSearchExcerpt } = await import(
	`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const article = { id: "first", url: "/STA/", paths: ["/STA/", "/posts/first/", "/posts/alias/"] };
const makeResult = (url, title = "同名文章") => ({ url, meta: { title }, excerpt: "test" });
const results = deduplicateSearchResults(
	[
		makeResult("https://example.com/posts/first/#heading"),
		makeResult("/STA/"),
		makeResult("/posts/alias/"),
		makeResult("/other/"),
		makeResult("/other/#heading"),
	],
	[article],
);
assert.deepEqual(
	results.map((item) => item.url),
	["/STA/", "/other/"],
);
assert.equal(results.length, 2, "不同文章同名时不能合并");
assert.equal(deduplicateSearchResults([], [article]).length, 0);
assert.equal(
	deduplicateSearchResults([makeResult("/中文/"), makeResult("/%E4%B8%AD%E6%96%87/")], []).length,
	1,
);
console.log("PASS: 搜索按文章身份去重，兼容旧链接、编码路径与同名文章。");

assert.equal(findSearchArticle("/posts/alias/#part", [article])?.id, "first");
assert.equal(matchesSearchText("Solid State Physics", "STA"), true);
assert.equal(matchesSearchText("Solid State Physics", "STA", true), false);
assert.equal(matchesSearchText("STA Timing Analysis", "STA", true), true);
assert.equal(matchesSearchText("Digital IC uses setup and hold", "setup IC", true), true);
assert.equal(matchesSearchText("中\u200b文资料", "中文", true), true);
assert.equal(matchesSearchText("Case Sensitive", '"Case Sensitive"', true), true);
assert.equal((highlightSearchText("STA State sta", "STA").match(/<mark /g) || []).length, 3);
assert.equal((highlightSearchText("STA State sta", "STA", true).match(/<mark /g) || []).length, 1);
assert.equal(highlightSearchText("<img src=x onerror=alert(1)> C++", "C++"),
	'&lt;img src=x onerror=alert(1)&gt; <mark class="search-match">C++</mark>');
assert.equal(highlightSearchText("literal [x].*", "[x].*"),
	'literal <mark class="search-match">[x].*</mark>');
assert.equal(highlightSearchText("a & b", ""), "a &amp; b");
const preciseExcerpt = matchingSearchExcerpt("State " + "其他内容 ".repeat(100) + "STA 正确位置", "STA", true);
assert.ok(preciseExcerpt.includes("STA 正确位置"));
assert.ok(!preciseExcerpt.includes("State"));
console.log("PASS: 大小写、多个关键词、中文、字面符号、安全高亮及精确摘要。");

try {
	const commentConfig = await readCommentConfig();
	const audit = await auditProject();
	assert.deepEqual(audit.issues.filter((issue) => issue.level === "error"), [], "文章源检查必须先通过");
	const publicPosts = audit.articles.filter((post) => !post.data.draft && !post.data.encrypted);
	assert.ok(publicPosts.length > 0, "至少一篇公开文章");
	const pages = await mapLimit(publicPosts, 3, async (post) => {
		const canonical = await get(post.url);
		const canonicalDom = parse(canonical);
		assert.ok(canonicalDom.querySelector(".custom-md"), `${post.url}: 正文已渲染`);
		assert.notEqual(canonicalDom.querySelector("html").getAttribute("data-pagefind-ignore"), "all", post.url);
		const canonicalLink = canonicalDom.querySelector('link[rel="canonical"]')?.getAttribute("href");
		assert.ok(canonicalLink, `${post.url}: 缺少 canonical`);
		assert.equal(decodeURIComponent(new URL(canonicalLink).pathname), decodeURIComponent(post.url), post.url);
		assert.equal(canonicalDom.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content"), canonicalLink, `${post.url}: 评论回链必须指向正式地址`);
		if (!commentConfig.enable) assert.equal(canonicalDom.querySelector("[data-comment-provider]"), null, `${post.url}: 关闭评论时不渲染占位框`);
		const paths = [{ url: post.url, content: canonical }];
		for (const url of post.paths.filter((url) => url !== post.url)) {
			const content = await get(url);
			const legacy = parse(content);
			assert.equal(legacy.querySelector("html").getAttribute("data-pagefind-ignore"), "all", url);
			assert.equal(legacy.querySelector('link[rel="canonical"]')?.getAttribute("href"), canonicalLink, url);
			assert.equal(legacy.querySelector('meta[name="giscus:backlink"]')?.getAttribute("content"), canonicalLink, `${url}: 旧入口的评论回链`);
			paths.push({ url, content });
		}
		return { dom: canonicalDom, paths };
	});
	const { index, errors } = await pagefind.createIndex({
		excludeSelectors: ["[data-pagefind-ignore]", "span.katex", "span.katex-display"],
	});
	assert.deepEqual(errors, []);
	assert.ok(index);
	for (const { url, content } of pages.flatMap((page) => page.paths)) {
		const indexed = await index.addHTMLFile({ url, content });
		assert.deepEqual(indexed.errors, []);
	}
	const { files } = await index.getFiles();
	assert.equal(
		files.filter((file) => file.path.startsWith("fragment/")).length,
		publicPosts.length,
		"每篇公开文章只能产生一份索引，数量必须与源文章一致",
	);
	console.log(`PASS: ${publicPosts.length} 篇文章的正式入口、旧入口、canonical 与 Pagefind 去重。`);
	const images = new Set(pages.flatMap((page) => page.dom.querySelectorAll(".custom-md img[src]")
		.map((img) => new URL(img.getAttribute("src"), base).href)
		.filter((url) => new URL(url).origin === new URL(base).origin)));
	await mapLimit([...images], 4, async (url) => {
		const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(60000) });
		assert.equal(response.status, 200, url);
		assert.match(response.headers.get("content-type") || "", /^image\//, url);
	});
	console.log(`PASS: ${images.size} 个正文图片地址可访问，响应类型均为图片。`);
	const expectedUrls = publicPosts.map((post) => decodeURIComponent(post.url)).sort();
	const expectedImageCounts = new Map(publicPosts.map((post, index) => [
		decodeURIComponent(post.url), pages[index].dom.querySelectorAll(".custom-md img[src]").length,
	]));
	const feedImages = new Set();
	const feeds = [];
	for (const path of ["/rss.xml", "/atom.xml"]) {
		const source = await get(path);
		assert.equal(XMLValidator.validate(source), true, `${path}: 必须是合法 XML`);
		const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(source);
		const list = path === "/rss.xml" ? xml.rss.channel.item : xml.feed.entry;
		const items = list ? (Array.isArray(list) ? list : [list]) : [];
		assert.equal(items.length, publicPosts.length, `${path}: 不得遗漏公开文章或收录草稿、加密文章`);
		const urls = items.map((item) => decodeURIComponent(new URL(path === "/rss.xml" ? item.link : item.link["@href"]).pathname));
		assert.deepEqual([...urls].sort(), expectedUrls, `${path}: 链接必须逐篇对应公开文章，不得重复`);
		const dates = items.map((item) =>
			Date.parse(path === "/rss.xml" ? item.pubDate : item.published),
		);
		assert.ok(dates.every(Number.isFinite), `${path}: 有效日期`);
		assert.ok(
			dates.every((date, index) => index === 0 || date <= dates[index - 1]),
			`${path}: 按发布日期降序`,
		);
		for (const item of items) {
			const content = path === "/rss.xml" ? item["content:encoded"] : item.content?.["#text"] ?? item.content;
			assert.equal(typeof content, "string", `${path}: 每篇文章应有订阅正文`);
			const html = parse(content);
			const link = new URL(path === "/rss.xml" ? item.link : item.link["@href"]);
			assert.equal(html.querySelectorAll("img[src]").length, expectedImageCounts.get(decodeURIComponent(link.pathname)), `${path}: ${link.pathname} 订阅不得遗漏正文图片`);
			for (const img of html.querySelectorAll("img[src]")) {
				const src = img.getAttribute("src");
				assert.match(src, /^(?:https?:|data:)/, `${path}: 图片不能保留相对路径 ${src}`);
				const image = new URL(src);
				if (image.origin === link.origin || image.origin === new URL(base).origin) feedImages.add(new URL(image.pathname + image.search, base).href);
			}
		}
		feeds.push(urls);
		console.log(`PASS: ${path} XML 合法，${items.length} 篇文章与公开源清单一致，顺序及图片路径正确。`);
	}
	assert.deepEqual(feeds[0], feeds[1], "RSS 与 Atom 文章顺序应一致");
	await mapLimit([...feedImages], 4, async (url) => {
		const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(60000) });
		assert.equal(response.status, 200, url);
		assert.match(response.headers.get("content-type") || "", /^image\//, url);
	});
	console.log(`PASS: ${feedImages.size} 个本地订阅图片地址可访问，响应类型均为图片。`);
} finally {
	await pagefind.close();
}
