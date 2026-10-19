type Measure = Pick<CanvasRenderingContext2D, "measureText">;
const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(part => part.segment);

/** Keep Latin words together; only oversized words may break at grapheme boundaries. */
export function wrapCanvasText(ctx: Measure, text: string, maxWidth: number): string[] {
	if (!(maxWidth > 0)) return [];
	const lines: string[] = [];
	for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
		let line = "";
		const tokens = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(paragraph)]
			.flatMap(part => /^[\p{Script=Latin}\p{N}'’_.-]+$|^\s+$/u.test(part.segment) ? [part.segment] : graphemes(part.segment));
		for (const token of tokens) {
			if (!line && !token.trim()) continue;
			if (ctx.measureText(line + token).width <= maxWidth) { line += token; continue; }
			if (line.trimEnd()) lines.push(line.trimEnd());
			line = "";
			if (!token.trim()) continue;
			for (const part of graphemes(token)) {
				if (line && ctx.measureText(line + part).width > maxWidth) { lines.push(line); line = ""; }
				line += part;
			}
		}
		if (line || !paragraph) lines.push(line.trimEnd());
	}
	return lines;
}

export function limitCanvasLines(ctx: Measure, lines: string[], maxWidth: number, count: number): string[] {
	if (lines.length <= count) return lines;
	const result = lines.slice(0, count);
	const last = graphemes(result[count - 1]);
	while (last.length && ctx.measureText(last.join("") + "…").width > maxWidth) last.pop();
	result[count - 1] = last.join("").trimEnd() + "…";
	return result;
}
