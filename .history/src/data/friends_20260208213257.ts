// 友情链接数据配置
// 用于管理友情链接页面的数据

export interface FriendItem {
	id: number;
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags: string[];
}

// 友情链接数据
export const friendsData: FriendItem[] = [
	{
		id: 1,
		title: "Mizuki Docs",
		imgurl: "http://q.qlogo.cn/headimg_dl?dst_uin=3231515355&spec=640&img_type=jpg",
		desc: "Mizuki 用户手册",
		siteurl: "https://docs.mizuki.mysqil.com",
		tags: ["Docs"],
	},
	{
		id: 2,
		title: "Astro",
		imgurl: "https://avatars.githubusercontent.com/u/44914786?v=4&s=640",
		desc: "内容驱动型网站的web框架",
		siteurl: "https://github.com/withastro/astro",
		tags: ["Framework"],
	},
	{
		id: 3,
		title: "GitHub",
		imgurl: "https://avatars.githubusercontent.com/u/9919?v=4&s=640",
		desc: "开源的力量.",
		siteurl: "https://github.com",
		tags: ["Development", "Platform"],
	},
	{
		id: 4,
		title: "Typora",
		imgurl: "https://typoraio.cn/img/favicon-128.png",
		desc: "优秀的Markdown编辑器, 支持多平台, 界面简洁, 功能强大.",
		siteurl: "https://typoraio.cn/",
		tags: ["software", "Markdown"],
	},
	{
		id: 5,
		title: "VLOOK",
		imgurl: "data:image/png;base64,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",
		desc: "一位优秀学长的个人博客, 记录了很多学习资源和技术分享",
		siteurl: "https://madmaxchow.github.io/VLOOK/index.html",
		tags: ["Blog"],
	},
	{
		id: 6,
		title: "LiMingXiang's Record",
		imgurl: "https://love-learning-li.github.io/img/butterfly-icon.png",
		desc: "一位优秀学长的个人博客, 记录了很多学习资源和技术分享",
		siteurl: "https://love-learning-li.github.io/",
		tags: ["Blog"],
	},
];

// 获取所有友情链接数据
export function getFriendsList(): FriendItem[] {
	return friendsData;
}

//两种排序方式:

// // 1. 随机排序
// export function getShuffledFriendsList(): FriendItem[] {
// 	const shuffled = [...friendsData];
// 	for (let i = shuffled.length - 1; i > 0; i--) {
// 		const j = Math.floor(Math.random() * (i + 1));
// 		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
// 	}
// 	return shuffled;
// }

// 2. 按 id 顺序排序
export function getShuffledFriendsList(): FriendItem[] {
	return [...friendsData].sort((a, b) => a.id - b.id);
}

