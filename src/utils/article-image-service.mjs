import sharpService from "astro/assets/services/sharp";
import { getImage } from "astro:assets";

export default {
	...sharpService,
	async getHTMLAttributes(options, config) {
		const attributes = await sharpService.getHTMLAttributes(options, config);
		if ((options["data-article-image"] || options["data-print-image"]) && typeof options.src === "object") {
			const print = await getImage({ src: options.src, width: Math.min(1600, options.src.width), format: options.src.format === "png" ? "png" : "jpeg", quality: 94 });
			// Imported metadata points to the emitted original, independently of srcset.
			return { ...attributes, "data-original-src": options.src.src, "data-src": options.src.src, "data-print-src": print.src };
		}
		return attributes;
	},
};
