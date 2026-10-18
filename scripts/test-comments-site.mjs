import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { chromium } from "playwright-core";

const arguments_ = process.argv.slice(2);
const base = arguments_.find((argument) => !argument.startsWith("--")) || "http://localhost:4321";
const soakMinutes = Number(arguments_.find((argument) => argument.startsWith("--soak="))?.split("=", 2)[1] || 0);
assert.ok(Number.isFinite(soakMinutes) && soakMinutes >= 0 && soakMinutes <= 60, "持续巡检时长须为 0–60 分钟");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ colorScheme: null, viewport: { width: 1440, height: 1000 } });
const errors = [];
let gtmLoads = 0;
let clarityLoads = 0;
const css = await readFile(new URL("../public/giscus.css", import.meta.url), "utf8");
context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.stack || error.message)));
await context.route("https://asround-blog.pages.dev/giscus.css", (route) => route.fulfill({ contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: css }));
await context.route("https://www.googletagmanager.com/**", (route) => {
	gtmLoads++;
	return route.fulfill({ contentType: "application/javascript", body: "window.testGtmReady=true;" });
});
await context.route("https://www.clarity.ms/**", (route) => {
	clarityLoads++;
	return route.fulfill({ contentType: "application/javascript", body: "if(window.testClarityReady)throw Error('Clarity loaded twice');window.testClarityReady=true;window.clarity=function(){};" });
});
await context.route("https://giscus.app/**", (route) => {
	if (new URL(route.request().url()).pathname.endsWith(".css")) return route.fulfill({ contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: "" });
	return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><style>
body{margin:0;background:white;color:black}textarea{width:95%;resize:vertical;background:rgb(246,248,250);color:black}
@media(prefers-color-scheme:dark){body{background:rgb(13,17,23);color:white}textarea{background:rgb(1,4,9);color:white}}
</style></head><body><form class="gsc-comment-box"><textarea class="gsc-comment-box-textarea" placeholder="Write a comment" aria-label="test draft"></textarea></form><script>
const theme=new URL(location.href).searchParams.get('theme');
if(theme && /^https?:/.test(theme)){const link=document.createElement('link');link.rel='stylesheet';link.crossOrigin='anonymous';link.href=theme;document.head.append(link);}
window.addEventListener('message',e=>{const theme=e.data?.giscus?.setConfig?.theme;if(theme?.startsWith('data:text/css;')){const link=document.createElement('link');link.rel='stylesheet';link.href=theme;document.head.append(link);}});
parent.postMessage({giscus:{resizeHeight:280,discussion:{id:'D_fixture'}}},'*');
</script></body></html>` });
});

async function navigate(page, pathname) {
	await page.evaluate((pathname) => new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			window.swup.hooks.off("visit:end", end);
			reject(new Error(`Swup navigation timed out: ${pathname}`));
		}, 30000);
		const end = () => {
			clearTimeout(timer);
			window.swup.hooks.off("visit:end", end);
			resolve();
		};
		window.swup.hooks.on("visit:end", end);
		window.swup.navigate(pathname);
	}), pathname);
}

async function commentFrame(page) {
	const iframe = await page.locator("giscus-widget").locator("iframe").elementHandle();
	try {
		return await iframe.contentFrame();
	} finally {
		await iframe.dispose();
	}
}

try {
	const page = await context.newPage();
	await page.goto(new URL("/", base).href, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => window.swup && window.testClarityReady && window.testGtmReady);
	assert.equal(await page.locator("#reader-comment-link").count(), 0);
	for (const pathname of ["/archive/", "/about/"]) {
		await navigate(page, pathname);
		assert.equal(await page.locator("#article-comments, #reader-comment-link").count(), 0, pathname);
	}
	await navigate(page, "/STA/");
	await page.locator("#reader-comment-link").waitFor();
	assert.equal(await page.locator("giscus-widget").count(), 0, "长文章顶部不提前加载服务");
	await page.evaluate(() => { window.testCommentVisits = 0; window.swup.hooks.on("visit:start", () => window.testCommentVisits++); });
	await page.locator("#reader-comment-link").click();
	await page.waitForURL("**/STA/#article-comments");
	const frame = await commentFrame(page);
	await frame.locator("textarea").waitFor();
	await frame.waitForFunction(() => getComputedStyle(document.querySelector("textarea")).minHeight === "100px");
	assert.equal(await page.evaluate(() => window.testCommentVisits), 0, "跳转走原生锚点，不触发整页 Swup 导航");
	assert.equal(await page.evaluate(() => document.activeElement.id), "article-comments", "键盘焦点随锚点进入评论区域");
	await page.locator(".comment-help summary").click();
	await page.waitForFunction(() => document.querySelector(".comment-help")?.open);
	assert.equal(await page.locator(".comment-help").getAttribute("open"), "");
	assert.ok((await page.locator(".comment-help-content").innerText()).includes('$`E=mc^2`$'));
	await page.evaluate(() => { window.previousWidget = document.querySelector("giscus-widget"); });
	await navigate(page, "/archive/");
	assert.equal(await page.evaluate(() => window.previousWidget.isConnected), false);
	await page.evaluate(() => { delete window.previousWidget; });
	assert.equal(await page.locator("#reader-comment-link").count(), 0);
	await navigate(page, "/Summer-camp/");
	await page.locator("#reader-comment-link").focus();
	await page.keyboard.press("Enter");
	await page.waitForURL("**/Summer-camp/#article-comments");
	const nextFrame = await commentFrame(page);
	await nextFrame.locator("textarea").waitFor();
	assert.equal(new URL(nextFrame.url()).searchParams.get("term"), "/Summer-camp/");
	assert.equal(await page.locator("giscus-widget").count(), 1);
	assert.equal(gtmLoads, 1, "站内切页不重复加载 GTM");
	assert.equal(clarityLoads, 1, "站内切页不重复加载 Clarity");
	console.log("PASS 首页/归档/关于页隐藏入口、文章锚点与键盘跳转、100px 输入框、写法提示、切页清理、统计脚本只加载一次");

	for (const width of [1920, 1440, 1024, 900, 640]) {
		await page.setViewportSize({ width, height: 1000 });
		const section = page.locator("#article-comments");
		await section.scrollIntoViewIfNeeded();
		assert.equal(await page.locator("#reader-comment-link").isVisible(), width >= 1024, `工具栏可见范围 ${width}px`);
		assert.ok(await section.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), `评论卡片不横向溢出 ${width}px`);
	}
	await page.setViewportSize({ width: 1440, height: 1000 });
	await nextFrame.locator("textarea").fill("Keep this draft during rapid theme changes.");
	for (let index = 0; index < 8; index++) {
		await page.locator('#reading-controls button[aria-label*="切换到"]').click({ force: true });
	}
	await page.waitForFunction(() => !document.documentElement.classList.contains("theme-circle-transition"));
	const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
	await nextFrame.waitForFunction((dark) => matchMedia("(prefers-color-scheme:dark)").matches === dark, dark);
	assert.equal(await nextFrame.locator("textarea").inputValue(), "Keep this draft during rapid theme changes.");
	assert.equal(await page.locator("giscus-widget").count(), 1);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.locator('#reading-controls button[aria-label*="切换到"]').click();
	assert.equal(await page.evaluate(() => document.documentElement.classList.contains("theme-circle-transition")), false);
	assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "auto");
	console.log("PASS 1920/1440/1024/900/640px 布局、快速连切主题保留草稿、减少动效偏好");

	if (soakMinutes > 0) {
		await page.emulateMedia({ reducedMotion: "no-preference" });
		const session = await context.newCDPSession(page);
		const deadline = Date.now() + soakMinutes * 60000;
		let cycle = 0;
		let baselineMessages;
		const counters = [];
		while (Date.now() < deadline) {
			const pathname = cycle % 2 === 0 ? "/STA/" : "/Summer-camp/";
			await navigate(page, "/archive/");
			assert.equal(await page.locator("giscus-widget, #reader-comment-link").count(), 0);
			await navigate(page, pathname);
			await page.locator("#reader-comment-link").click();
			const current = await commentFrame(page);
			await current.locator("textarea").fill(`Unpublished stress-test draft ${cycle}`);
			await page.locator('#reading-controls button[aria-label*="切换到"]').click();
			await page.waitForFunction(() => !document.documentElement.classList.contains("theme-circle-transition"));
			assert.equal(await current.locator("textarea").inputValue(), `Unpublished stress-test draft ${cycle}`);
			assert.equal(new URL(current.url()).searchParams.get("term"), pathname);
			assert.equal(await page.locator("giscus-widget").count(), 1);
			const listeners = await session.send("Runtime.evaluate", {
				expression: "(getEventListeners(window).message || []).length", includeCommandLineAPI: true, returnByValue: true,
			});
			const messageCount = listeners.result.value;
			baselineMessages ??= messageCount;
			assert.equal(messageCount, baselineMessages, "跨页之后不累积评论消息监听器");
			if (cycle % (soakMinutes < 3 ? 2 : 8) === 0) {
				await session.send("HeapProfiler.collectGarbage");
				const memory = await session.send("Memory.getDOMCounters");
				counters.push({ cycle, messageCount, ...memory });
				console.log(`PASS sustained cycle ${cycle}: one widget, ${messageCount} message listeners; DOM ${memory.nodes}, listeners ${memory.jsEventListeners}`);
			}
			assert.equal(gtmLoads, 1);
			assert.equal(clarityLoads, 1);
			assert.deepEqual(errors, []);
			cycle++;
			// Allow delayed callbacks, idle tasks and frame cleanup to settle between visits.
			await page.waitForTimeout(Math.min(6000, Math.max(0, deadline - Date.now())));
		}
		console.log(JSON.stringify({ sustainedMinutes: soakMinutes, cycles: cycle, counters }));
	}

	await context.route(new URL("/STA/?test-no-comments=1", base).href, async (route) => {
		const response = await route.fetch();
		const document = parse(await response.text());
		for (const island of document.querySelectorAll("astro-island")) {
			if (island.querySelector("[data-comment-provider]")) island.remove();
		}
		await route.fulfill({ response, body: document.toString() });
	});
	await page.goto(new URL("/STA/?test-no-comments=1", base).href, { waitUntil: "domcontentloaded" });
	await page.locator("#reading-controls").waitFor();
	assert.equal(await page.locator("#article-comments, #reader-comment-link").count(), 0, "单篇关闭或配置缺失时不显示无效锚点");
	console.log("PASS 文章没有评论区时隐藏跳转入口");
	assert.deepEqual(errors, []);
} finally {
	await context.unrouteAll({ behavior: "ignoreErrors" });
	await browser.close();
}
