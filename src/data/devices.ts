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
	摄影: [
		{
			name: "Nikon Z30",
			image: "/images/device/z30.png",
			specs: "APS-C / 小巧轻便 / 可翻转屏",
			description: "性价比微单, 配16-50可以揣裤兜.",
			link: "https://www.nikon.com.cn/sc_CN/product/mirrorless/z-30#overview",
		},
		{
			name: "Nikkor Z DX 16-50mm f/3.5-6.3 VR",
			image: "/images/device/16-50.png",
			specs: "广角 / 小巧轻便",
			description: "晴天画质优秀, 轻便愿意外带.",
			link: "https://www.nikon.com.cn/sc_CN/product/nikkor-lenses/z-mount/zoom/wide-angle-zoom/z-dx-16-50mm-f-3-5-6-3-vr#overview",
		},
		{
			name: "Nikkor Z DX 50-250mm f/4.5-6.3 VR",
			image: "/images/device/50-250.png",
			specs: "长焦 / 打鸟 / 摄月",
			description: "带上三脚架, 晚上等月亮一等就是俩小时.",
			link: "https://www.nikon.com.cn/sc_CN/product/nikkor-lenses/z-mount/zoom/telephoto-zoom/z-dx-50-250mm-f-4-5-6-3-vr",
		},
		{
			name: "Viltrox AF 35mm F1.7 Air",
			image: "/images/device/Viltrox_35mm.png",
			specs: "定焦 / 大光圈 / 人像",
			description: "超性价比大光定, 人像表现不错, 漫展次次都带它.",
			link: "https://www.viltrox.com.cn/productinfo/3229917.html",
		},
		{
			name: "Marsecce ET-2541S 三脚架",
			image: "/images/device/Tripod.png",
			specs: "碳纤维 / 轻便",
			description: "轻便稳定, 我的第一款碳纤维产品.",
			link: "https://detail.tmall.com/item.htm?ak=26017758&ali_trackid=2%3Amm_26632943_457000242_108858100157%2C123%3A1702705027_080_318059982&bxsign=tbkxmvRJ2O2ZTBQihqrQ71IwF5aPGXR31jm9KATb2movL7y4TzcuFr3tM8YNh2sRVPkyO_fHa8pt-eXMly33VxcvMGcbU4_ixWhrjJaGMD15UJgY_B8wCzGMV2edUpI8A1mJSo0BpzPhPmKynBBP4J6LA&id=658437144303&relationId=2909377191&unid=123&union_lens=lensId%3ATAPI%401702705026%40213e994c_0d5a_18c7120d479_093e%4001%3Brecoveryid%3A080_301268779%401702705027808",
		},
		{
			name: "Cwatcun D88 二代灰色大号相机包",
			image: "/images/device/CameraBag.png",
			specs: "大容量 / 多隔层 / 防水",
			description:
				"相机带三镜头 + 充电套装 + 一个三脚架 + 清洁套装 + 两个笔记本 + 一套全身衣物. 没满.",
			link: "https://detail.tmall.com/item.htm?id=724387459564&mi_id=00006qRrCoG-VTmRZBv_ECMH1hz6Ls_1oSnmlpJSejdO6Vs&skuId=6013723162792&spm=tbpc.boughtlist.suborder_itemtitle.1.71922e8dnPJPEJ",
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

