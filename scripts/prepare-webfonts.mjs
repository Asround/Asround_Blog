import { readFile, writeFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import { isVariableFont, webFontJob } from "./font-processing.mjs";
import { importTS } from "./check-content.mjs";

// Rebuild full web fonts without building the site or changing the original TTF.
const source = await readFile("src/config.ts", "utf8");
const tree = ts.createSourceFile("config.ts", source, ts.ScriptTarget.Latest, true);
const config = tree.statements.filter(ts.isVariableStatement).flatMap(item => [...item.declarationList.declarations]).find(item => item.name.getText(tree) === "siteConfig");
const font = config.initializer.properties.find(item => item.name?.getText(tree) === "font");
const settings = (await importTS(`export default ${font.initializer.getText(tree)}`)).default;
const require = createRequire(import.meta.resolve("fontmin"));
const { TTFReader, toArrayBuffer } = require("fonteditor-core");
for (const name of new Set(Object.values(settings).flatMap(font => font.localFonts || []))) {
	if (!/\.ttf$/i.test(name)) continue;
	if (path.basename(name) !== name) throw new Error("Font must be in public/assets/font");
	const input = path.join("public/assets/font", name);
	const bytes = await readFile(input);
	let text = "";
	if (!isVariableFont(bytes)) {
		// Rewriting cmap also repairs duplicate private-use ranges in the original
		// CJK font, which Chromium rejects. Keep every mapped Unicode character.
		const data = new TTFReader().read(toArrayBuffer(bytes));
		text = Object.keys(data.cmap).map(Number).filter(code => code > 0).map(code => String.fromCodePoint(code)).join("");
	}
	const files = await new Promise((resolve, reject) => webFontJob(input, bytes, text).run((error, files) => error ? reject(error) : resolve(files)));
	const result = files.find(file => file.path.endsWith(".woff2"));
	if (!result) throw new Error(`Failed to convert ${name}`);
	const output = input.replace(/\.ttf$/i, ".woff2");
	await writeFile(output, result.contents);
	console.log(JSON.stringify({ output, original: (await stat(input)).size, compressed: result.contents.length }));
}
