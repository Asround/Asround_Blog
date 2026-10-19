import sharpService from "astro/assets/services/sharp";

export default {
	...sharpService,
	async getHTMLAttributes(options, config) {
		const attributes = await sharpService.getHTMLAttributes(options, config);
		if (options["data-article-image"] && typeof options.src === "object") {
			// Imported metadata points to the emitted original, independently of srcset.
			return { ...attributes, "data-original-src": options.src.src, "data-src": options.src.src };
		}
		return attributes;
	},
};
