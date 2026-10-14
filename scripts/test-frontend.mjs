import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { parse } from "node-html-parser";
import * as pagefind from "pagefind";

// 使用正在运行的开发预览；索引只在内存中生成，不构建站点或写入 dist。
const base = process.argv[2] || "http://localhost:4321";
async function get(path) {
	const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(60000) });
	assert.equal(response.status, 200, path);
	return response.text();
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
	const canonical = await get("/STA/");
	const legacy = await get("/posts/2026-10-02_sta/");
	const canonicalDom = parse(canonical);
	const legacyDom = parse(legacy);
	assert.equal(legacyDom.querySelector("html").getAttribute("data-pagefind-ignore"), "all");
	assert.equal(
		canonicalDom.querySelector('link[rel="canonical"]').getAttribute("href"),
		legacyDom.querySelector('link[rel="canonical"]').getAttribute("href"),
	);
	const { index, errors } = await pagefind.createIndex({
		excludeSelectors: ["[data-pagefind-ignore]", "span.katex", "span.katex-display"],
	});
	assert.deepEqual(errors, []);
	assert.ok(index);
	for (const [url, content] of [
		["/STA/", canonical],
		["/posts/2026-10-02_sta/", legacy],
	]) {
		const indexed = await index.addHTMLFile({ url, content });
		assert.deepEqual(indexed.errors, []);
	}
	const { files } = await index.getFiles();
	assert.equal(
		files.filter((file) => file.path.startsWith("fragment/")).length,
		1,
		"正式入口与旧入口只能产生一份文章索引",
	);
	console.log("PASS: 实际文章 HTML 只产生一份 Pagefind 索引，旧链接可访问。");
	for (const path of ["/rss.xml", "/atom.xml"]) {
		const xml = parse(await get(path), { lowerCaseTagName: true });
		const items = xml.querySelectorAll(path === "/rss.xml" ? "item" : "entry");
		assert.ok(items.length > 0, path);
		const dates = items.map((item) =>
			Date.parse(item.querySelector(path === "/rss.xml" ? "pubdate" : "published").text),
		);
		assert.ok(dates.every(Number.isFinite), `${path}: 有效日期`);
		assert.ok(
			dates.every((date, index) => index === 0 || date <= dates[index - 1]),
			`${path}: 按发布日期降序`,
		);
		assert.ok(
			!items.some((item) => item.querySelector("title").text.includes("必修课选课")),
			`${path}: 不包含草稿`,
		);
		console.log(`PASS: ${path} 共 ${items.length} 篇公开文章，按日期排序且不包含草稿。`);
	}
} finally {
	await pagefind.close();
}
