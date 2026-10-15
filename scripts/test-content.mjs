import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { auditContent, createFileInspector, projectRoot } from "./check-content.mjs";

function document(body = "", metadata = "", name = "example") {
	return { file: `src/content/posts/${name}/index.md`, source:
		`---\ntitle: 测试文章\npublished: 2026-10-15\ndescription: 检查示例\n${metadata}\n---\n${body}` };
}

const run = (documents, options = {}) => auditContent({ documents, inspectFile: async () => "ok", ...options });
const codes = (result) => result.issues.map((issue) => issue.code);

test("RSS 和 JSON 等站内端点不是 public 文件附件", async () => {
	const result = await run([document("[RSS](/rss.xml)\n\n[数据](/api/data.json?x=1)")], {
		staticRoutes: ["/rss.xml", "/api/data.json"],
		inspectFile: async () => { throw new Error("有效站内端点不应检查磁盘文件"); },
	});
	assert.equal(result.issues.length, 0);
});

test("加密文章缺少密码时检查失败，避免配置错误导致正文公开", async () => {
	assert.ok(codes(await run([document("", "encrypted: true")])).includes("encryption-password"));
	assert.ok(!codes(await run([document("", 'encrypted: true\npassword: "example-password"')])).includes("encryption-password"));
});

test("与 Astro 共用元数据规则，拒绝类型错误和重复的 YAML 字段", async () => {
	for (const metadata of ["draft: 'false'", "tags: STA", "category: [a, b]", "published: 2026-10-16"]) {
		assert.ok((await run([document("", metadata)])).issues.some((issue) => issue.level === "error"));
	}
	assert.ok(codes(await run([{ file: "bad.md", source: "# no frontmatter" }])).includes("frontmatter"));
	assert.ok(codes(await run([document("", "title: ' '")])).includes("yaml"));
});

test("日历日期不能被 YAML 静默进位，合法闰年可以通过", async () => {
	const invalid = document();
	invalid.source = invalid.source.replace("2026-10-15", "2026-02-30");
	assert.ok(codes(await run([invalid])).includes("date"));
	const valid = document();
	valid.source = valid.source.replace("2026-10-15", "2024-02-29");
	assert.equal((await run([valid])).issues.length, 0);
});

test("BOM、CRLF 和引用式图片被正确解析，代码和公式中的伪图片被忽略", async () => {
	const calls = [];
	const item = document('![图片][picture]\n\n[picture]: index.assets/%E4%B8%AD%E6%96%87%20image.png\n\n```md\n![示例](missing.png)\n```\n\n`![代码](missing.png)`\n\n$$\n![公式](missing.png)\n$$');
	item.source = "\uFEFF" + item.source.replace(/\n/g, "\r\n");
	const result = await run([item], { inspectFile: async (target) => { calls.push(target); return "ok"; } });
	assert.equal(result.issues.length, 0);
	assert.equal(calls.length, 1);
	assert.equal(path.basename(calls[0]), "中文 image.png");
});

test("检查封面、嵌套行内图片和附件，重复引用只检查一次", async () => {
	const calls = [];
	const result = await run([document('<span>![图](index.assets/image.png)</span>\n\n![图](index.assets/image.png)\n\n[下载](index.assets/file.pdf)', 'image: ./cover.png')], {
		inspectFile: async (target) => { calls.push(target); return "ok"; },
	});
	assert.ok(!result.issues.some((issue) => issue.level === "error"));
	assert.equal(result.resourceCount, 3);
	assert.equal(calls.length, 3);
});

test("丢失、大小写错误和目录形式的资源均报告为错误，位置对应原始文件", async () => {
	for (const status of ["missing", "case", "directory"]) {
		const result = await run([document("![图](index.assets/image.png)")], { inspectFile: async () => status });
		assert.equal(result.issues[0].code, "resource-" + status);
		assert.equal(result.issues[0].level, "error");
		assert.equal(result.issues[0].line, 7);
	}
});

test("拒绝本机路径、危险协议和越界路径，外链不联网检查", async () => {
	for (const value of ["file:///E:/image.png", "E:/image.png", "../../../../../outside.png", "/%2e%2e/secret.png", "index.assets/%broken.png", "index.assets/a%00.png", "index.assets%5Ca.png"]) {
		const result = await run([document(`![图](${value})`)]);
		assert.ok(codes(result).includes("resource-path"), value);
	}
	const result = await run([document("![图](https://example.invalid/image.png)\n\n![图](data:image/png;base64,AAAA)\n\n[邮件](mailto:a@example.com)\n\n[文章](/STA/)\n\n[锚点](#heading)")], {
		inspectFile: async () => { throw new Error("不应请求外部资源或文章路径"); },
	});
	assert.equal(result.issues.length, 0);
});

test("原生 HTML 相对图片报错，公开目录图片可检查，示例代码不误报", async () => {
	assert.ok(codes(await run([document('<img src="index.assets/image.png">')])).includes("html-image"));
	assert.equal((await run([document('<img src="/assets/image.png">\n\n```html\n<img src="missing.png">\n```')])).issues.length, 0);
});

test("旧目录和标题跳级只提醒，不把可用的旧文章判为失败", async () => {
	const result = await run([document("## 正文\n\n#### 跳级\n\n![图](old.assets/image.png)\n\n![图](old.assets/another.png)")]);
	assert.deepEqual(codes(result).sort(), ["heading-skip", "legacy-assets"]);
	assert.ok(result.issues.every((issue) => issue.level === "warning"));
});

test("识别 Astro 小写化的文章 ID 冲突，不把同名标题合并", async () => {
	const result = await run([document("", "", "Example"), document("", "", "example")]);
	assert.ok(codes(result).includes("duplicate-id"));
	assert.equal((await run([document("", "", "a"), document("", "", "b")])).issues.length, 0);
});

test("自定义永久链接、旧链接和 alias 与静态页面都参与冲突检查", async () => {
	assert.ok(codes(await run([document("", 'permalink: "STA"', "a"), document("", 'permalink: "%53TA"', "b")])).includes("route-collision"));
	assert.ok(codes(await run([document("", 'permalink: "archive"')], { staticRoutes: ["/archive/"] })).includes("route-collision"));
	assert.ok(codes(await run([document("", 'permalink: "rss.xml"')], { staticRoutes: ["/rss.xml"] })).includes("route-collision"));
	assert.ok(codes(await run([document("", 'alias: "b"', "a"), document("", "", "b")])).includes("route-collision"));
	for (const value of ["a/b", "a%2Fb", "..", "a?x=1", "a%20b", "%invalid"]) {
		assert.ok(codes(await run([document("", `permalink: "${value}"`)])).includes("permalink"), value);
	}
});

test("实际路由清单同时保留正式与旧入口，全局日期模板也可检查", async () => {
	const result = await run([document("", 'permalink: "STA"')]);
	assert.equal(result.articles[0].url, "/STA/");
	assert.deepEqual(result.articles[0].paths, ["/posts/example/", "/STA/"]);
	const configured = await run([document()], { permalink: { enable: true, format: "%year%-%monthnum%-%day%-%postname%" } });
	assert.equal(configured.articles[0].url, "/2026-10-15-example/");
});

test("百度提取码与 URL 一致，卡片示例代码不触发验证", async () => {
	assert.ok(codes(await run([document('::baidu{url="https://pan.baidu.com/s/example?pwd=1234" code="5678"}')])).includes("baidu-code"));
	assert.ok(codes(await run([document('::baidu{url="https://example.com/s/example"}')])).includes("baidu-url"));
	assert.ok(codes(await run([document('::github{repo="https://github.com/owner/repo"}')])).includes("github-repo"));
	assert.equal((await run([document('::baidu{url="https://pan.baidu.com/s/example?pwd=1234" code="1234"}\n\n::github{repo="owner/repo"}\n\n```md\n::github{repo="invalid"}\n```')])).issues.length, 0);
});

test("真实磁盘检查在 Windows 上也严格检查路径大小写，不写入测试文件", async () => {
	const inspect = createFileInspector();
	assert.equal(await inspect(path.join(projectRoot, "package.json")), "ok");
	assert.equal(await inspect(path.join(projectRoot, "PACKAGE.json")), "case");
	assert.equal(await inspect(path.join(projectRoot, "src")), "directory");
	assert.equal(await inspect(path.join(projectRoot, "__nonexistent_content_check_file__")), "missing");
});
