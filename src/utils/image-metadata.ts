import path from "node:path";
import sharp from "sharp";

const sizes = new Map<string, Promise<{ width?: number; height?: number }>>();
/** Static public images keep their URLs but still reserve intrinsic space. */
export function publicImageSize(src: string) {
	if (!sizes.has(src)) sizes.set(src, (async () => {
		try {
			const root = path.resolve("public");
			const file = path.resolve(root, "." + decodeURIComponent(src.split(/[?#]/, 1)[0]));
			if (!file.startsWith(root + path.sep)) return {};
			const { width, height } = await sharp(file).metadata();
			return { width, height };
		} catch { return {}; }
	})());
	return sizes.get(src)!;
}
