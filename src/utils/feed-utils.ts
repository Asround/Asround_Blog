import path from "node:path";
import type { ImageMetadata } from "astro";
import MarkdownIt from "markdown-it";
import { parse } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

const markdown = new MarkdownIt({ html: true });
type FeedPost = { body?: string; filePath?: string };
type ImageImports = Record<string, () => Promise<{ default: ImageMetadata | string }>>;

/** 按真实源文件位置解析，不能用已经小写化的 collection ID 推算磁盘目录。 */
export function feedImageImportPath(filePath: string, src: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const sourceStart = normalized.indexOf("/src/content/");
	const source = sourceStart >= 0 ? normalized.slice(sourceStart + 1) : normalized.replace(/^\.\//, "");
	if (!source.startsWith("src/content/")) throw new Error(`无法解析订阅文章源路径: ${filePath}`);
	const decoded = decodeURIComponent(src.split(/[?#]/, 1)[0]);
	return "/" + path.posix.normalize(path.posix.join(path.posix.dirname(source), decoded));
}

export async function renderFeedContent(
	post: FeedPost,
	site: URL,
	images: ImageImports,
	optimize: (image: ImageMetadata) => Promise<string>,
): Promise<string> {
	const html = parse(markdown.render(String(post.body ?? "")));
	const resolvedImages = new Map<string, Promise<string>>();
	for (const img of html.querySelectorAll("img[src]")) {
		const src = img.getAttribute("src")!;
		if (/^(?:https?:|data:)/i.test(src)) continue;
		if (src.startsWith("/")) {
			img.setAttribute("src", new URL(src, site).href);
			continue;
		}
		if (!post.filePath) throw new Error(`订阅文章缺少 filePath，无法解析图片: ${src}`);
		const importPath = feedImageImportPath(post.filePath, src);
		if (!resolvedImages.has(importPath)) {
			resolvedImages.set(importPath, (async () => {
				const load = images[importPath];
				if (!load) throw new Error(`订阅图片未被资源映射收录: ${importPath}`);
				const image = (await load()).default;
				return new URL(typeof image === "string" ? image : await optimize(image), site).href;
			})());
		}
		img.setAttribute("src", await resolvedImages.get(importPath)!);
	}
	return sanitizeHtml(html.toString(), {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
	});
}

/** XML 文本和属性共用；先处理 &，避免重复转义刚生成的实体。 */
export function escapeXML(value: unknown): string {
	return String(value ?? "")
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function xmlCDATA(value: string): string {
	return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}
