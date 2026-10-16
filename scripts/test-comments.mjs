import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { auditContent, importTS } from "./check-content.mjs";
import { checkCommentConfig, checkLocalStylesheet, checkRemoteComments, readCommentConfig } from "./check-comments.mjs";

const { getCommentTerm, shouldShowComments, giscusConfigurationErrors, getGiscusStylesheetUrl } = await importTS(
	await readFile(new URL("../src/utils/comment-utils.ts", import.meta.url), "utf8"),
);
const giscus = { repo: "owner/comments", repoId: "R_example", category: "文章评论", categoryId: "DIC_example" };
const config = { enable: true, provider: "giscus", giscus };

test("正式地址生成稳定评论标识，自定义标识优先且区分大小写", () => {
	assert.equal(getCommentTerm("/STA/?query=1#x"), "/STA/");
	assert.equal(getCommentTerm("/%E4%B8%AD%E6%96%87"), "/中文/");
	assert.equal(getCommentTerm("/renamed/", " /STA/ "), "/STA/");
	assert.equal(getCommentTerm("/"), "/");
	assert.notEqual(getCommentTerm("/STA/"), getCommentTerm("/sta/"));
});

test("默认关闭、单篇关闭、草稿、加密文章均不显示评论", () => {
	assert.equal(shouldShowComments(config, {}), true);
	assert.equal(shouldShowComments({ ...config, enable: false }, {}), false);
	for (const post of [{ comment: false }, { draft: true }, { encrypted: true }]) assert.equal(shouldShowComments(config, post), false);
});

test("未准备好真实公开 ID 时不展示组件，开启配置则检查失败", () => {
	for (const field of ["repo", "repoId", "category", "categoryId"]) {
		const invalid = { ...config, giscus: { ...giscus, [field]: "" } };
		assert.equal(shouldShowComments(invalid, {}), false);
		assert.ok(checkCommentConfig(invalid).errors.length);
	}
	assert.equal(giscusConfigurationErrors(giscus).length, 0);
	assert.equal(checkCommentConfig({ ...config, enable: false, giscus: undefined }).errors.length, 0);
});

test("旧配置仍可回退 Twikoo，选择 giscus 后不会借 Twikoo 配置绕过校验", () => {
	assert.equal(shouldShowComments({ enable: true, twikoo: { envId: "https://example.com" } }, {}), true);
	assert.equal(shouldShowComments({ enable: true, provider: "giscus", twikoo: { envId: "https://example.com" } }, {}), false);
});

test("评论 CSS 按传入的正式或本地开发地址解析，配置拒绝非 HTTPS 和含凭据的地址", () => {
	assert.equal(getGiscusStylesheetUrl({ ...giscus, themeStylesheet: "/giscus.css" }, "https://example.com/"), "https://example.com/giscus.css");
	assert.equal(getGiscusStylesheetUrl({ ...giscus, themeStylesheet: "/giscus.css" }, "http://localhost:4321/"), "http://localhost:4321/giscus.css");
	assert.equal(getGiscusStylesheetUrl(giscus, "https://example.com/"), undefined);
	for (const themeStylesheet of ["http://example.com/a.css", "javascript:alert(1)", "https://name:secret@example.com/a.css"]) {
		assert.ok(giscusConfigurationErrors({ ...giscus, themeStylesheet }).length);
	}
});

const document = (id, extra = "") => ({ file: `src/content/posts/${id}/index.md`, source: `---\ntitle: Test\npublished: 2026-10-01\ndescription: Test\n${extra}\n---\nText` });
const audit = (documents) => auditContent({ documents, inspectFile: async () => "ok" });
test("评论标识重复与自定义/默认标识冲突都能阻止发布", async () => {
	for (const documents of [
		[document("a", "commentId: same"), document("b", "commentId: same")],
		[document("a", "permalink: STA"), document("b", "commentId: /STA/")],
	]) assert.ok((await audit(documents)).issues.some((issue) => issue.code === "comment-id-collision"));
	assert.equal((await audit([document("a"), document("b")])).issues.length, 0);
});

test("拒绝空或多行评论标识，正常自定义标识通过", async () => {
	for (const extra of ['commentId: " "', 'commentId: "a\\nb"', 'commentId: "a\\tb"', 'commentId: "a\\x7fb"']) assert.ok((await audit([document("a", extra)])).issues.some((issue) => issue.code === "metadata"));
	assert.equal((await audit([document("a", "commentId: fixed-id")])).issues.length, 0);
});

test("实际配置遵守启用状态对应的校验规则", async () => {
	const actual = await readCommentConfig();
	assert.equal(checkCommentConfig(actual).errors.length, 0);
	assert.ok(["giscus", "twikoo"].includes(actual.provider));
	await checkLocalStylesheet(actual);
});

const remoteFixture = () => [
	{ private: false, has_discussions: true, node_id: giscus.repoId },
	{ repositoryId: giscus.repoId, categories: [{ id: giscus.categoryId, name: giscus.category }] },
	{ origins: ["https://example.com", "http://localhost:4321"] },
];
const remoteFetch = (values) => async (url) => ({
	ok: true, status: 200,
	json: async () => values[url.includes("api.github.com") ? 0 : url.includes("giscus.app") ? 1 : 2],
});

test("远端检查同时验证仓库、应用分类访问、ID 与允许来源", async () => {
	assert.match(await checkRemoteComments(config, "https://example.com/", remoteFetch(remoteFixture())), /远端检查通过/);
	for (const mutate of [
		(values) => { values[0].private = true; },
		(values) => { values[0].has_discussions = false; },
		(values) => { values[0].node_id = "R_wrong"; },
		(values) => { values[1].categories = []; },
		(values) => { values[1].categories[0].name = "wrong-category"; },
		(values) => { values[2].origins = ["https://example.com"]; },
	]) {
		const values = remoteFixture(); mutate(values);
		await assert.rejects(checkRemoteComments(config, "https://example.com/", remoteFetch(values)));
	}
});

test("远端服务失败明确报错，关闭时不请求远端", async () => {
	await assert.rejects(checkRemoteComments(config, "https://example.com/", async () => ({ ok: false, status: 403 })), /HTTP 403/);
	assert.match(await checkRemoteComments({ ...config, enable: false }, "https://example.com/", () => { throw new Error("不应联网"); }), /跳过/);
});
