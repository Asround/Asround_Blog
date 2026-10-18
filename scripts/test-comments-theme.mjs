import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { readFile } from "node:fs/promises";

// Exercise the actual reading-toolbar button and the browser compositor. Merely
// checking the final DOM color misses a new → old → new flash during capture.
const base = process.argv[2] || "http://localhost:4321";
const width = Number(process.env.COMMENT_TEST_WIDTH) || 1440;
const cpuRate = Number(process.env.COMMENT_TEST_CPU_RATE) || 1;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ colorScheme: null, viewport: { width, height: 1000 } });
const enhancementCSS = await readFile(new URL("../public/giscus.css", import.meta.url), "utf8");
await context.route("https://asround-blog.pages.dev/giscus.css", (route) => route.fulfill({ contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: enhancementCSS }));
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com)\//, (route) => route.abort());
await context.route("https://giscus.app/**", (route) => new URL(route.request().url()).pathname.endsWith(".css")
	? route.fulfill({ contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: "" })
	: route.fulfill({
	contentType: "text/html; charset=utf-8",
	body: `<!doctype html><html><head><style>
body{margin:0;background:white;color:black}textarea{display:block;box-sizing:border-box;width:100%;height:200px;background:var(--color-canvas-inset,rgb(246,248,250));color:var(--color-fg-default,black)}
@media(prefers-color-scheme:dark){body{background:rgb(13,17,23);color:white}textarea{background:var(--color-canvas-inset,rgb(1,4,9));color:var(--color-fg-default,white)}}
</style></head><body><main><textarea aria-label="test draft"></textarea></main><script>
const theme=new URL(location.href).searchParams.get('theme');
if(theme && /^https?:/.test(theme)){const link=document.createElement('link');link.rel='stylesheet';link.crossOrigin='anonymous';link.href=theme;document.head.append(link);}
window.addEventListener('message',e=>{const theme=e.data?.giscus?.setConfig?.theme;if(theme?.startsWith('data:text/css;')){const link=document.createElement('link');link.rel='stylesheet';link.href=theme;document.head.append(link);}});
parent.postMessage({giscus:{resizeHeight:220,discussion:{id:'D_fixture'}}},'*');
</script></body></html>`,
}));

try {
	const page = await context.newPage();
	page.setDefaultTimeout(60000);
	await page.addInitScript(() => {
		window.themeAnimationChecks = { ready: 0, skipped: [], circles: [], finished: 0 };
		const start = document.startViewTransition.bind(document);
		document.startViewTransition = (...args) => {
			const transition = start(...args);
			const started = performance.now();
			transition.ready.then(() => window.themeAnimationChecks.ready++, (error) => {
				window.themeAnimationChecks.skipped.push({ reason: String(error), elapsed: performance.now() - started });
			});
			return transition;
		};
		const animate = Element.prototype.animate;
		Element.prototype.animate = function (keyframes, options) {
			const animation = animate.call(this, keyframes, options);
			if (options?.pseudoElement?.startsWith("::view-transition-")) {
				window.themeAnimationChecks.circles.push({ keyframes, options });
				animation.finished.then(() => window.themeAnimationChecks.finished++, () => {});
			}
			return animation;
		};
	});
	const session = await context.newCDPSession(page);
	await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
	await page.goto(new URL("/STA/", base).href, { waitUntil: "domcontentloaded" });
	await page.locator("#article-comments").scrollIntoViewIfNeeded();
	const iframe = await page.locator("giscus-widget").locator("iframe").elementHandle();
	const frame = await iframe.contentFrame();
	await frame.locator("textarea").fill("Never publish this local test draft.");
	await frame.locator("textarea").scrollIntoViewIfNeeded();
	await frame.waitForFunction(() => matchMedia("(prefers-color-scheme:dark)").matches);
	// Dev themes arrive via a config message after the iframe's initial render.
	// Wait for that stylesheet before recording, rather than sampling a theme load.
	await frame.waitForFunction(() => getComputedStyle(document.querySelector("main")).getPropertyValue("--asround-accent").trim());
	await page.waitForFunction(() => window.swup && !document.documentElement.classList.contains("is-changing"));
	const box = await frame.locator("textarea").boundingBox();
	const point = { left: Math.round(box.x + 12), top: Math.round(box.y + box.height - 12), width: 1, height: 1 };
	assert.ok(point.top < 1000, "采样点必须位于屏幕内");
	const phases = [];
	const samples = [];
	session.on("Page.screencastFrame", (event) => {
		samples.push({ timestamp: event.metadata.timestamp, image: Buffer.from(event.data, "base64") });
		void session.send("Page.screencastFrameAck", { sessionId: event.sessionId });
	});
	await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
	for (let cycle = 0; cycle < 4; cycle++) {
		const dark = cycle % 2 === 1;
		const phase = { cycle, dark, start: Date.now() / 1000 };
		phases.push(phase);
		await page.getByRole("button", { name: dark ? "切换到深色模式" : "切换到浅色模式", exact: true }).click();
		await page.waitForFunction(() => !document.documentElement.classList.contains("theme-circle-transition"));
		const checks = await page.evaluate(() => window.themeAnimationChecks);
		assert.deepEqual(checks.skipped, [], "不能以跳过动画的方式通过配色测试");
		assert.equal(checks.ready, cycle + 1, "浏览器必须成功创建主题快照");
		assert.equal(checks.circles.length, cycle + 1, "每次切换必须启动圆形动画");
		assert.equal(checks.finished, cycle + 1, "圆形动画必须完整播放");
		const circle = checks.circles[cycle];
		assert.equal(circle.options.pseudoElement, dark ? "::view-transition-new(root)" : "::view-transition-old(root)");
		assert.ok(circle.options.duration > 0);
		assert.ok(circle.keyframes.clipPath.every((clip) => clip.startsWith("circle(")));
		assert.notEqual(circle.keyframes.clipPath[0], circle.keyframes.clipPath[1]);
		await frame.waitForFunction((dark) => matchMedia("(prefers-color-scheme:dark)").matches === dark, dark);
		// Include a stable final frame even when the compositor stops sending updates.
		const image = await page.screenshot();
		phase.end = Date.now() / 1000;
		samples.push({ timestamp: phase.end, image });
		assert.equal(await frame.locator("textarea").inputValue(), "Never publish this local test draft.");
		assert.equal(await page.locator("giscus-widget").count(), 1);
	}
	await session.send("Page.stopScreencast");
	for (let cycle = 0; cycle < 4; cycle++) {
		const sequence = [];
		const phase = phases[cycle];
		for (const sample of samples.filter((entry) => entry.timestamp >= phase.start && entry.timestamp <= phase.end).sort((a, b) => a.timestamp - b.timestamp)) {
			const pixel = await sharp(sample.image).extract(point).raw().toBuffer();
			const dark = pixel[0] + pixel[1] + pixel[2] < 384;
			if (sequence.at(-1) !== dark) sequence.push(dark);
		}
		assert.ok(sequence.length <= 2, `第 ${cycle + 1} 次切换出现颜色反转：${sequence.map((dark) => dark ? "dark" : "light").join(" → ")}`);
		assert.equal(sequence.at(-1), cycle % 2 === 1, "最终配色正确");
		console.log(`PASS compositor ${width}px / CPU ${cpuRate}x cycle ${cycle + 1}: ${sequence.map((dark) => dark ? "dark" : "light").join(" → ")}`);
	}
} finally { await browser.close(); }
