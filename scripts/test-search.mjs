import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTS } from "./check-content.mjs";
const { searchResultUrl, searchPattern } = await importTS(await readFile("src/utils/search-utils.ts", "utf8"));
test("搜索定位链接保留锚点和原参数，大小写模式与搜索一致", () => {
	const url = new URL(searchResultUrl("/STA/?other=1#chapter", 'setup "hold time"', true), "https://example.com");
	assert.equal(url.searchParams.get("highlight"), 'setup "hold time"');
	assert.equal(url.searchParams.get("highlightCase"), "1");
	assert.equal(url.searchParams.get("other"), "1");
	assert.equal(url.hash, "#chapter");
	assert.equal(searchResultUrl("/STA/", "  "), "/STA/");
	assert.equal(new URL(searchResultUrl("/STA/?highlightCase=1", "setup"), "https://example.com").searchParams.has("highlightCase"), false);
});
test("正文与搜索结果共用字面匹配，支持短语并转义正则字符", () => {
	assert.deepEqual([..."hold time SETUP setup".matchAll(searchPattern('"hold time" setup', false))].map(x => x[0]), ["hold time", "SETUP", "setup"]);
	assert.deepEqual([..."SETUP setup".matchAll(searchPattern("setup", true))].map(x => x[0]), ["setup"]);
	assert.deepEqual([..."a+b aab".matchAll(searchPattern("a+b", false))].map(x => x[0]), ["a+b"]);
	assert.equal(searchPattern("  ", false), undefined);
});
