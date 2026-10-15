import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const source = await readFile(new URL("../src/utils/feed-utils.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from (["'])([^"']+)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { feedImageImportPath, renderFeedContent, escapeXML, xmlCDATA } = await import(
	`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`,
);
const rssRequire = createRequire(import.meta.resolve("@astrojs/rss/package.json"));
const { XMLParser, XMLValidator } = rssRequire("fast-xml-parser");

test("SVG 使用 Vite 资源 URL，不作为位图交给图片优化器", async () => {
	const html = await renderFeedContent({ filePath: "src/content/posts/STA/index.md", body: "![矢量图](index.assets/diagram.svg)" }, new URL("https://blog.example/"), {
		"/src/content/posts/STA/index.assets/diagram.svg": async () => ({ default: "/_astro/diagram.hash.svg" }),
	}, async () => { throw new Error("SVG 不应优化为位图"); });
	assert.ok(html.includes('src="https://blog.example/_astro/diagram.hash.svg"'));
});

test("订阅图片按真实文件路径解析，保留大小写并支持多级目录", () => {
	assert.equal(feedImageImportPath("src/content/posts/STA/index.md", "index.assets/a.png"), "/src/content/posts/STA/index.assets/a.png");
	assert.equal(feedImageImportPath("E:\\blog\\src\\content\\posts\\Nested\\STA\\index.md", "./index.assets/%E4%B8%AD%E6%96%87%20image.png?x=1"), "/src/content/posts/Nested/STA/index.assets/中文 image.png");
	assert.equal(feedImageImportPath("src/content/posts/Nested/STA/index.md", "../shared.png"), "/src/content/posts/Nested/shared.png");
	assert.equal(feedImageImportPath("src/content/posts/article.md", "images/one.webp"), "/src/content/posts/images/one.webp");
	assert.throws(() => feedImageImportPath("STA", "image.png"), /源路径/);
});

test("Markdown 和 HTML 包裹的图片都转换为绝对地址，同一图片只优化一次", async () => {
	let optimized = 0;
	const html = await renderFeedContent({ filePath: "src/content/posts/STA/index.md", body:
		'<span style="width: 500px">![图](index.assets/image.png)</span>\n\n![图](index.assets/image.png)\n\n![外链](https://example.com/a.png)\n\n![公开图片](/assets/image.png)\n\n<script>alert(1)</script>\n\n<img src="/assets/a.png" onerror="alert(1)">' }, new URL("https://blog.example/"), {
		"/src/content/posts/STA/index.assets/image.png": async () => ({ default: { src: "source" } }),
	}, async () => { optimized++; return "/_astro/optimized.webp"; });
	assert.equal(optimized, 1);
	assert.equal((html.match(/https:\/\/blog.example\/_astro\/optimized.webp/g) || []).length, 2);
	assert.ok(html.includes('src="https://blog.example/assets/image.png"'));
	assert.ok(html.includes('src="https://example.com/a.png"'));
	assert.ok(!html.includes("&lt;span"));
	assert.ok(!html.includes("<script"));
	assert.ok(!html.includes("onerror"));
});

test("缺失源文件信息或图片映射时明确失败，不静默输出失效的相对地址", async () => {
	await assert.rejects(renderFeedContent({ body: "![图](index.assets/a.png)" }, new URL("https://blog.example/"), {}, async () => ""), /filePath/);
	await assert.rejects(renderFeedContent({ filePath: "src/content/posts/STA/index.md", body: "![图](index.assets/a.png)" }, new URL("https://blog.example/"), {}, async () => ""), /资源映射/);
});

test("标题、摘要、分类和带查询参数的链接可以安全写入 XML", () => {
	const value = 'A & B <tag> "引号" \'单引号\'';
	const xml = `<entry><title>${escapeXML(value)}</title><link href="${escapeXML("https://example.com/?a=1&b=2")}"/><summary>${escapeXML(value)}</summary><category term="${escapeXML(value)}"/></entry>`;
	assert.equal(XMLValidator.validate(xml), true);
	const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
	assert.equal(parsed.entry.title, value);
	assert.equal(parsed.entry.summary, value);
	assert.equal(parsed.entry.category["@_term"], value);
	assert.equal(parsed.entry.link["@_href"], "https://example.com/?a=1&b=2");
	assert.equal(escapeXML("a\u0000b\u001fc"), "abc");
});

test("CDATA 结束符出现在文章代码中时仍生成合法 XML，并保留原文", () => {
	const value = "<pre>literal ]]> and again ]]></pre>";
	const xml = `<content>${xmlCDATA(value)}</content>`;
	assert.equal(XMLValidator.validate(xml), true);
	assert.equal(new XMLParser({ trimValues: false }).parse(xml).content, value);
});
