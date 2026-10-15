import { getImage } from "astro:assets";
// import { getCollection } from "astro:content";
import type { RSSFeedItem } from "@astrojs/rss";
import rss from "@astrojs/rss";
import type { APIContext, ImageMetadata } from "astro";
import { siteConfig } from "@/config";
import { getFeedPosts } from "@/utils/content-utils";
import { renderFeedContent } from "@/utils/feed-utils";
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

	const feed: RSSFeedItem[] = [];

	for (const post of posts) {
		const content = await renderFeedContent(post, context.site, imagesGlob, async (src) => (await getImage({ src })).src);

		feed.push({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.published,
			link: getPostUrl(post),
			content,
		});
	}

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site,
		items: feed,
		customData: `<language>${siteConfig.lang}</language>`,
	});
}
