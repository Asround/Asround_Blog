// 日记数据配置
// 用于管理日记页面的数据

export interface DiaryItem {
	id: number;
	content: string;
	date: string;
	images?: string[];
	location?: string;
	mood?: string;
	tags?: string[];
}

// 示例日记数据
const diaryData: DiaryItem[] = [
	{
		id: 1,
		content:
			"完成初步的个人博客搭建, 使用了 Mizuki 模版, 还在不断完善中.<br/>期待未来能在这里记录更多的生活点滴和技术分享.",
		date: "2026-02-08T12:30:00Z",
		images: ["/images/diary/2026-02-08/README.webp"],
	},
	{
		id: 2,
		content:
			'自己DIY装了个机, 快乐.<br/>更多内容可以查看我的 <a href="/posts/26-03-06_personal-computer/" class="text-[var(--primary)] underline">装机分享博客</a>.',
		date: "2026-03-06T12:00:00Z",
		images: [
			"/images/diary/2026-03-06/PC1.jpg",
			"/images/diary/2026-03-06/PC2.webp",
			"/images/diary/2026-03-06/PC3.webp",
		],
	},
	{
		id: 3,
		content:
			"小黄鱼出掉了 ThinkBook. 10000购入, 6150卖出. 虽然还是有点舍不得, 但留着确实也没什么用了. 出给一个看重商务外观的卖家, 希望能继续发光发热~",
		date: "2026-03-20T14:02:00Z",
		images: [
			// "/images/diary/2026-03-20/ThinkBook1.jpg",
			// "/images/diary/2026-03-20/ThinkBook2.webp",
			// "/images/diary/2026-03-20/ThinkBook3.webp",
		],
	},
	{
		id: 4,
		content:
			'主机的风扇 RGB 总是有点小问题, 判断主板供电不足导致不能灯光全亮, 卖了一个按带按钮控制的SATA供电线, 但是默认彩虹光污染不喜欢. 昨天整了一个ARGB集线器, 可以遥控器/主板双控, 也终于算是"基本"解决. 为什么是基本呢? 因为问题其实可能不在于主板供电, 而在于软件对于灯珠的控制, 不能控制到不亮的那几个灯珠. 切换主板模式的时候原来不亮的部分还是不对, 索性用遥控器直接调一个模式固定了~',
		date: "2026-03-31T23:00:00Z",
		images: ["/images/diary/2026-03-31/argb.jpg"],
	},
	{
		id: 5,
		content: "平行世界里的一个我一定会和沈澜沧很像.",
		date: "2026-04-17T17:30:00Z",
		images: ["/images/diary/2026-04-17/kuishan_slc_gx.webp"],
	},
	{
		id: 6,
		content:
			'逛 IFS 手机店和电脑店有感.<br/>看了各家轻薄机, 荣耀卡卡的, 手感不好; 三星手感不错, 屏幕不赖; iPhone Air 唯一真神, 除了单扬确实没得说. 另一个神奇的事情是, 手感上 iPhone 17PM 居然比 17P 轻, 太奇怪了. 也去摸了一下之前关注过的vivo x ultra系列, x300ultra 这摄影规格确实不错, 不过这凸起也太厚了, 甚至背板和摄影模组相接处还用白色渐变来做掩盖. 最难受的其实还是这鬼手机专业模式都不能禁止它自动修图, 店员还反驳我说:"现在没有哪家手机不这样的." 直接就是屋檐了, 这修的这么狠, 只能说无法接受, 还是老老实实玩儿我的 z30 罢. <br/>电脑这块, 除了小米, 各家根本没展出自己的轻薄旗舰, 败兴. 小米确实轻, 但质感比 MBA 还是差了一大截. <br/>后面去 ROG 店里玩儿了一圈, 也是体验上了98x3d+5090+2k540的顶级外设, 在店员指导下打了人生第一把 csgo (因为店里机子没下其他游戏), 死斗(似乎是这个名字)kd0.8. 最后发现惊艳我的是48.5g的龙鳞2ace鼠标, 决定生日礼物就是它了!',
		date: "2026-04-18T19:28:00Z",
		// images: ["/images/diary/2026-04-18/kuishan_slc_gx.webp"],
	},
];

// 获取日记统计数据
export const getDiaryStats = () => {
	const total = diaryData.length;
	const hasImages = diaryData.filter(
		(item) => item.images && item.images.length > 0,
	).length;
	const hasLocation = diaryData.filter((item) => item.location).length;
	const hasMood = diaryData.filter((item) => item.mood).length;

	return {
		total,
		hasImages,
		hasLocation,
		hasMood,
		imagePercentage: Math.round((hasImages / total) * 100),
		locationPercentage: Math.round((hasLocation / total) * 100),
		moodPercentage: Math.round((hasMood / total) * 100),
	};
};

// 获取日记列表（按时间倒序）
export const getDiaryList = (limit?: number) => {
	const sortedData = diaryData.sort(
		(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
	);

	if (limit && limit > 0) {
		return sortedData.slice(0, limit);
	}

	return sortedData;
};

// 获取最新的日记
export const getLatestDiary = () => {
	return getDiaryList(1)[0];
};

// 根据ID获取日记
export const getDiaryById = (id: number) => {
	return diaryData.find((item) => item.id === id);
};

// 获取包含图片的日记
export const getDiaryWithImages = () => {
	return diaryData.filter((item) => item.images && item.images.length > 0);
};

// 根据标签筛选日记
export const getDiaryByTag = (tag: string) => {
	return diaryData
		.filter((item) => item.tags?.includes(tag))
		.sort(
			(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
		);
};

// 获取所有标签
export const getAllTags = () => {
	const tags = new Set<string>();
	diaryData.forEach((item) => {
		if (item.tags) {
			item.tags.forEach((tag) => tags.add(tag));
		}
	});
	return Array.from(tags).sort();
};

export default diaryData;

