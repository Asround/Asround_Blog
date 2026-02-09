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
		imgurl: "https://madmaxchow.github.io/VLOOK/pic/vlook-dark.svg?darksrc=vlook-dark.svg#icon",
		desc: "十分强大的Typora拓展, 支持许多丰富排版功能.",
		siteurl: "https://madmaxchow.github.io/VLOOK/index.html",
		tags: ["Extension"],
	},
	{
		id: 6,
		title: "Convertio",
		imgurl: "https://pnggallery.com/wp-content/uploads/convertio-logo-04.png",
		desc: "在线文件转换工具, 支持多种格式之间的转换.",
		siteurl: "https://convertio.co/zh/",
		tags: ["Tool"],
	},
	{
		id: 7,
		title: "Squoosh",
		imgurl: "https://squoosh.app/c/icon-large-maskable-c2078ced.png",
		desc: "在线图片压缩, 支持多种格式和压缩选项.",
		siteurl: "https://squoosh.app/",
		tags: ["Tool"],
	},
	{
		id: 8,
		title: "Sci-Hub",
		imgurl: "https://www.scihub.net.cn/skin/black/images/logo.png",
		desc: "提供学术论文免费下载服务的在线平台.",
		siteurl: "https://www.scihub.net.cn/",
		tags: ["Tool"],
	},
	{
		id: 9,
		title: "Integral Calculator",
		imgurl: "https://www.integral-calculator.com/layout/integral-calculator.png",
		desc: "在线积分计算器, 支持详细步骤解析.",
		siteurl: "https://www.integral-calculator.com/",
		tags: ["Tool", "Math"],
	},
	{
		id: 10,
		title: "Dazidazi",
		imgurl: "https://dazidazi.com/favicon.ico",
		desc: "在线打字练习网站.",
		siteurl: "https://dazidazi.com/",
		tags: ["Tool"],
	},
	{
		id: 11,
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

