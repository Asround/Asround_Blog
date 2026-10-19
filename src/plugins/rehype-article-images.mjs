import path from "node:path";
import sharp from "sharp";
import { visit } from "unist-util-visit";

export function articleImageOptions(metadata) {
	const rotated = metadata.orientation >= 5;
	const naturalWidth = rotated ? metadata.height : metadata.width;
	if (!naturalWidth || !["png", "jpeg", "webp"].includes(metadata.format) || metadata.pages > 1) return undefined;
	const width = Math.min(1280, naturalWidth);
	return {
		width, widths: [...new Set([480, 800, 1280, 1920, 2560].filter(n => n < naturalWidth).concat(Math.min(2560, naturalWidth)))],
		format: metadata.format === "png" ? "png" : "webp",
		...(metadata.format === "png" ? {} : { quality: metadata.format === "webp" ? 95 : 82 }),
		sizes: `(max-width: 1024px) calc(100vw - 48px), (max-width: 1440px) calc(100vw - 360px), 1280px`,
		"data-article-image": "true",
	};
}

export function rehypeArticleImages() {
	return async (tree, file) => {
		if (!file.path) return;
		const nodes = [];
		visit(tree, "element", node => {
			if (node.tagName === "img" && typeof node.properties?.src === "string" && !/^(?:\/|[a-z][a-z\d+.-]*:|#)/i.test(node.properties.src)) nodes.push(node);
		});
		const sizes = new Map();
		await Promise.all(nodes.map(async node => {
			const filename = path.resolve(path.dirname(file.path), decodeURIComponent(node.properties.src.split(/[?#]/, 1)[0]));
			if (!sizes.has(filename)) sizes.set(filename, sharp(filename).metadata());
			const options = articleImageOptions(await sizes.get(filename));
			if (options) Object.assign(node.properties, options);
		}));
	};
}
