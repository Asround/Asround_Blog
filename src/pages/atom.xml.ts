import { getImage } from "astro:assets";
// import { getCollection } from "astro:content";
import type { APIContext, ImageMetadata } from "astro";
import { profileConfig, siteConfig } from "@/config";
import { getFeedPosts } from "@/utils/content-utils";
import { escapeXML, renderFeedContent, xmlCDATA } from "@/utils/feed-utils";
import { getPostUrl } from "@/utils/url-utils";
import { initPostIdMap } from "@/utils/permalink-utils";

// get dynamic import of images as a map collection
const imagesGlob = {
	...import.meta.glob<{ default: ImageMetadata }>("/src/content/**/*.{jpeg,jpg,png,gif,webp,avif,tiff,tif}"),
	...import.meta.glob<{ default: string }>("/src/content/**/*.svg", { query: "?url" }),
};

export async function GET(context: APIContext) {
	if (!context.site) {
		throw Error("site not set");
	}

	const posts = await getFeedPosts();

	// 初始化文章 ID 映射（用于 permalink 功能）
	initPostIdMap(posts);

	// 创建Atom feed头部
	let atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXML(siteConfig.lang.replace(/_/g, "-"))}">
  <title>${escapeXML(siteConfig.title)}</title>
  <subtitle>${escapeXML(siteConfig.subtitle || "No description")}</subtitle>
  <link href="${escapeXML(context.site)}" rel="alternate" type="text/html"/>
  <link href="${escapeXML(new URL("atom.xml", context.site))}" rel="self" type="application/atom+xml"/>
  <id>${escapeXML(context.site)}</id>
  <updated>${new Date().toISOString()}</updated>
`;

	for (const post of posts) {
		const content = await renderFeedContent(post, context.site, imagesGlob, async (src) => (await getImage({ src })).src);

		const postUrl = new URL(getPostUrl(post), context.site).href;

		atomFeed += `
  <entry>
    <title>${escapeXML(post.data.title)}</title>
    <link href="${escapeXML(postUrl)}" rel="alternate" type="text/html"/>
    <id>${escapeXML(postUrl)}</id>
    <published>${post.data.published.toISOString()}</published>
    <updated>${post.data.updated?.toISOString() || post.data.published.toISOString()}</updated>
    <summary>${escapeXML(post.data.description || "")}</summary>
    <content type="html">${xmlCDATA(content)}</content>
    <author>
      <name>${escapeXML(profileConfig.name)}</name>
    </author>`;

		// 添加分类标签
		if (post.data.category) {
			atomFeed += `
    <category term="${escapeXML(post.data.category)}"></category>`;
		}

		atomFeed += `
  </entry>`;
	}

	// 关闭Atom feed
	atomFeed += `
</feed>`;

	return new Response(atomFeed, {
		headers: {
			"Content-Type": "application/atom+xml; charset=utf-8",
		},
	});
}
