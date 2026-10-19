import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { isVariableFont, sfntTables, webFontJob } from "./font-processing.mjs";

const require = createRequire(import.meta.resolve("fontmin"));
const { Font, woff2 } = require("fonteditor-core");
await woff2.init();

async function convert(input, text) {
	const source = await readFile(input);
	const files = await new Promise((resolve, reject) => webFontJob(input, source, text).run((error, files) => error ? reject(error) : resolve(files)));
	return { source, ttf: files.find(file => /\.ttf$/i.test(file.path)).contents, compressed: files.find(file => file.path.endsWith(".woff2")).contents };
}

test("生产字体处理保留 TikTok Sans 的全部可变轴和原始 TTF，与开发 WOFF2 一致", async () => {
	const input = "public/assets/font/TikTokSans-VariableFont_opsz,slnt,wdth,wght.ttf";
	const { source, ttf, compressed } = await convert(input, "ABC123");
	assert.ok(isVariableFont(source));
	assert.deepEqual(ttf, source);
	const original = sfntTables(source);
	const output = sfntTables(Buffer.from(woff2.decode(compressed)));
	for (const table of ["fvar", "gvar", "HVAR", "MVAR", "avar", "STAT", "GPOS", "GSUB"]) {
		assert.ok(original.has(table), `Source includes ${table}`);
		assert.deepEqual(output.get(table), original.get(table), `Preserve ${table} exactly`);
	}
	assert.deepEqual(compressed, await readFile(input.replace(/\.ttf$/, ".woff2")));
});

test("中文静态字体仍可子集化，并保留所需字形和字体名称", async () => {
	const text = "字体测试ABC123";
	const { source, compressed } = await convert("public/assets/font/方正黑体-简体.TTF", text);
	assert.equal(isVariableFont(source), false);
	const original = Font.create(source, { type: "ttf", compound2simple: true }).get();
	const output = Font.create(compressed, { type: "woff2", compound2simple: true }).get();
	assert.equal(output.name.fontFamily, original.name.fontFamily);
	assert.ok(output.glyf.length < original.glyf.length);
	for (const char of text) {
		const code = char.codePointAt(0);
		assert.ok(output.cmap[code], `Include ${char}`);
		assert.deepEqual(output.glyf[output.cmap[code]].contours, original.glyf[original.cmap[code]].contours);
	}
});
