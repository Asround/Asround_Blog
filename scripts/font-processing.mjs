import Fontmin from "fontmin";

export function sfntTables(buffer) {
	if (buffer.length < 12) throw new Error("Invalid font header");
	const count = buffer.readUInt16BE(4);
	if (12 + count * 16 > buffer.length) throw new Error("Invalid font directory");
	const tables = new Map();
	for (let i = 0; i < count; i++) {
		const record = 12 + i * 16;
		const offset = buffer.readUInt32BE(record + 8);
		const length = buffer.readUInt32BE(record + 12);
		if (offset + length > buffer.length) throw new Error("Invalid font table bounds");
		tables.set(buffer.toString("ascii", record, record + 4), buffer.subarray(offset, offset + length));
	}
	return tables;
}

export function isVariableFont(buffer) {
	return sfntTables(buffer).has("fvar");
}

// Fontmin's glyph subsetter drops variation tables and freezes the default
// instance. Variable fonts must only be converted, retaining all their axes.
export function webFontJob(input, buffer, text) {
	const job = new Fontmin().src(input);
	if (!isVariableFont(buffer)) job.use(Fontmin.glyph({ text, hinting: false }));
	return job.use(Fontmin.ttf2woff2({ deflate: true }));
}
