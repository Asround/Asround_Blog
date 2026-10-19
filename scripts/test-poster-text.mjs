import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTS } from "./check-content.mjs";
const { wrapCanvasText, limitCanvasLines } = await importTS(await readFile("src/utils/poster-text.ts", "utf8"));
const ctx = { measureText: text => ({ width: [...text].length }) };
test("海报优先完整英文单词，中文可逐字换行，保留显式换行", () => {
	assert.deepEqual(wrapCanvasText(ctx, "setup and hold analysis", 14), ["setup and hold", "analysis"]);
	assert.deepEqual(wrapCanvasText(ctx, "中文 setup hold 分析", 10), ["中文 setup", "hold 分析"]);
	assert.deepEqual(wrapCanvasText(ctx, "first\nsecond", 10), ["first", "second"]);
	assert.ok(wrapCanvasText(ctx, "a".repeat(100), 12).every(line => line.length <= 12));
});
test("长标题和作者按行数截断并显示省略号，不超过可用宽度", () => {
	const lines = wrapCanvasText(ctx, "VeryLongName".repeat(100), 12);
	const output = limitCanvasLines(ctx, lines, 12, 2);
	assert.equal(output.length, 2); assert.ok(output[1].endsWith("…"));
	assert.ok(output.every(line => ctx.measureText(line).width <= 12));
});
