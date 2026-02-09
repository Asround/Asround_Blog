// 设备数据配置文件

export interface Device {
	name: string;
	image: string;
	specs: string;
	description: string;
	link: string;
}

// 设备类别类型，支持品牌和自定义类别
export type DeviceCategory = {
	[categoryName: string]: Device[];
} & {
	自定义?: Device[];
};

export const devicesData: DeviceCategory = {
	笔记本电脑: [
		{
			name: "Thinkbook 16p gen4 (2023)",
			image: "/images/device/laptop.png", // 路径: public/images/device/laptop.png
			specs: "i9-13900H / 4060",
			description: "足够使用, 足够商务. 生产力工具必不可少.",
			link: "https://www.thinkpad.com/device/thinkbook16-2023-i9?preview=true",
		},
		{
			name: "MacBook Air M4 13inch (2024)",
			image: "/images/device/mba.png",
			specs: "Apple M4 / 8 + 256",
			description: "足够轻便, 单核很强. 有win之后的最佳之选.",
			link: "https://support.apple.com/zh-cn/122209",
		},
	],
	显示器: [
		{
			name: "泰坦军团 P275MV PLUS",
			image: "/images/device/TitanArmy.png",
			specs: "4K双模 / MiniLED / HDR1400",
			description: "4K 办公, 用了都说好.",
			link: "https://www.titanarmy.cn/goods/details/index/id/381/cid/26.html",
		},
		{
			name: "Hisense 27G5-Pro",
			image: "/images/device/Hisense.png",
			specs: "2K-180Hz / FastIPS",
			description: "2K 高刷 IPS, 性价比之选.",
			link: "https://mall.hisense.com/items/5947",
		},
	],
	键鼠: [
		{
			name: "腹灵 OG98 机械键盘",
			image: "/images/device/OG98.png",
			specs: "3模 / 98键 / 冰薄荷轴 / 复古简约",
			description: "办公游戏主力.",
			link: "https://www.flesports.com/index.php/product/og98r/",
		},
		{
			name: "Cherry K37 薄膜键盘",
			image: "/images/device/Cherry.png",
			specs: "薄膜 / 更安静 / 防水",
			description: "安静(不完全)+耐用, 手感不差.",
			link: "https://www.cherry.cn/kbgame-6412.html",
		},
		{
			name: "漫步者 G5M Pro 鼠标",
			image: "/images/device/Mouse.png",
			specs: "快拆微动 / 磁吸充电 / 4k回报率",
			description: "到手直接换静音微动, 室友都说好.",
			link: "https://www.edifier.com/cn/product/product-736.html",
		},
	],
	耳机: [
		{
			name: "松下 Technics EAH-A800",
			image: "/images/device/Technics.png",
			specs: "优秀降噪 / 超长续航 / 可有线连接",
			description: "主要还挺好看.",
			link: "https://technics-cn.cn/products/headphones/eah-a800.html",
		},
		{
			name: "原道 OriG in 原点",
			image: "/images/device/OriG.png",
			specs: "入耳式 / 性价比",
			description: "这个价格还说啥了, 降噪和通透模式都还不错.",
			link: "https://item.jd.com/10185272057277.html?spmTag=YTAyNDAuYjAwMjQ5My5jMDAwMDQwMjcuMiUyM3NrdV9jYXJk",
		},
		{
			name: "AirPods 3",
			image: "/images/device/AirPods.png",
			specs: "半入耳 / 高续航 / 生态切换",
			description: "用了不知道多少年了, 没什么错误的选择.",
			link: "https://support.apple.com/zh-cn/111863",
		},
	],
	手柄: [
		{
			name: "飞智黑武士 4 Pro",
			image: "/images/device/Controller.png",
			specs: "xbox / 1k回报率",
			description: "除了FPS, 打游戏真得用手柄真舒服吧.",
			link: "https://www.flydigi.com/index/good/index/goods_id/88?nav_id=1",
		},
	],
	平板: [
		{
			name: "iPad Pro M4 11 inch (2024)",
			image: "/images/device/iPad.png",
			specs: "Pencil Pro / OLED",
			description: "双层串联OLED确实很惊艳, 但主要还是记笔记.",
			link: "https://support.apple.com/zh-cn/119892",
		},
	],
	手机: [
		{
			name: "iPhone SE3",
			image: "/images/device/iPhone.png",
			specs: "A15 / 小屏",
			description:
				"有电脑就几乎完全不用手机, 够用就行. 手大, 但喜欢小屏.",
			link: "https://support.apple.com/zh-cn/111866",
		},
	],
	// 自行车: [
	// 	{
	// 		name: "美涵达幻影700瓜车",
	// 		image: "/images/device/Bike.png",
	// 		specs: "速瑞达12速 / 40c / L码 / 10kg",
	// 		description: "学校的路还是瓜车适合, 舒适.",
	// 		link: "https://detail.tmall.com/item.htm?id=899447607102&mi_id=0000igwfviy-wAuna6i0b7uFdEwgvwA0Gy0VfmbgS1xVL64&spm=tbpc.boughtlist.suborder_itemtitle.1.303e2e8duza4JE&sku_properties=34219%3A20213",
	// 	},
	// ],
};

