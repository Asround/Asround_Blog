import sharpService from "astro/assets/services/sharp";

export default {
	...sharpService,
	// Keep passthrough originals distinct from resized/re-encoded images in Astro's cache.
	propertiesToHash: ["src", "width", "height", "format", "quality", "fit", "position", "background", "asroundOriginal"],
	async getURL(options, config) {
		const url = await sharpService.getURL(options, config);
		return options.asroundOriginal ? `${url}${url.includes("?") ? "&" : "?"}asroundOriginal=1` : url;
	},
	async parseURL(url, config) {
		const options = await sharpService.parseURL(url, config);
		if (options && url.searchParams.get("asroundOriginal") === "1") options.asroundOriginal = true;
		return options;
	},
	async transform(bytes, options, config) {
		if (options.asroundOriginal) return { data: bytes, format: options.format };
		return sharpService.transform(bytes, options, config);
	},
	async getHTMLAttributes(options, config) {
		const attributes = await sharpService.getHTMLAttributes(options, config);
		if ((options["data-article-image"] || options["data-print-image"]) && typeof options.src === "object") {
			const { getImage } = await import("astro:assets");
			const original = await getImage({ src: options.src, format: options.src.format, asroundOriginal: true });
			const print = await getImage({ src: options.src, width: Math.min(1600, options.src.width), format: options.src.format === "png" ? "png" : "jpeg", quality: 94 });
			// Register a byte-preserving output: Astro may prune the imported source after resizing.
			return { ...attributes, "data-original-src": original.src, "data-src": original.src, "data-print-src": print.src };
		}
		return attributes;
	},
};
