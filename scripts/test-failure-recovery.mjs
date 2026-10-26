import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.argv[2] || "http://localhost:4321";
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const errors = [];
async function setup(mode, playlist = []) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
	await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//, route => route.fulfill({ contentType: "application/javascript", body: "" }));
	// The dev-only Astro toolbar itself assumes writable storage; it is not shipped.
	await context.route(/\/(?:node_modules\/astro\/dist|@id\/astro)\/runtime\/client\/dev-toolbar\/entrypoint\.js(?:\?|$)/, route => route.fulfill({ contentType: "application/javascript", body: "" }));
	await context.route(url => url.searchParams.get("type") === "playlist" && url.searchParams.has("server"), route => route.fulfill({ contentType: "application/json", body: JSON.stringify(playlist) }));
	await context.addInitScript(mode => {
		if (mode === "blocked") {
			for (const name of ["localStorage", "sessionStorage"]) Object.defineProperty(window, name, { get() { throw new Error("Test blocked storage"); } });
		} else {
			localStorage.setItem("theme", "invalid-theme");
			localStorage.setItem("hue", "NaN");
			localStorage.setItem("music-player-volume", "100");
			if (mode === "quota") Storage.prototype.setItem = () => { throw new DOMException("Test quota", "QuotaExceededError"); };
		}
		window.testCopies = [];
		Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); } } });
		document.execCommand = command => { if (command !== "copy") return false; window.testCopies.push(document.querySelector("textarea[style*='-9999px']")?.value); return true; };
	}, mode);
	const page = await context.newPage();
	page.on("pageerror", error => errors.push(error.stack || error.message));
	page.on("console", message => { if (message.type() === "error" && /Error in hook/.test(message.text())) errors.push(message.text()); });
	return { context, page };
}
async function navigate(page, path) {
	await page.evaluate(path => new Promise((resolve, reject) => {
		const timer = setTimeout(() => { swup.hooks.off("visit:end", done); reject(Error(`Navigation timeout: ${path}`)); }, 30000);
		const done = () => { clearTimeout(timer); swup.hooks.off("visit:end", done); resolve(); };
		swup.hooks.on("visit:end", done); swup.navigate(path);
	}), path);
}
try {
	for (const mode of ["blocked", "quota"]) {
		const { context, page } = await setup(mode);
		await page.goto(new URL("/STA/", base).href);
		await page.waitForFunction(() => window.swup && document.querySelector("audio"));
		assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
		assert.notEqual(await page.evaluate(() => document.documentElement.style.getPropertyValue("--hue")), "NaN");
		await page.locator('#reading-controls button[title*="模式"]').click();
		await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
		await page.locator(".font-trigger").click();
		await page.locator("#reading-font-slider").evaluate(input => { input.value = "18"; input.dispatchEvent(new Event("input", { bubbles: true })); });
		await navigate(page, "/archive/");
		await navigate(page, "/STA/");
		assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false, "存储不可写时站内切页保持主题");
		assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--reading-font-size")), "18px");
		await navigate(page, "/rss/");
		for (const path of ["/rss/", "/atom/", "/rss/"]) {
			if (new URL(page.url()).pathname !== path) await navigate(page, path);
			const button = page.locator(path === "/rss/" ? "#copy-rss-btn" : "#copy-atom-btn");
			const expected = await button.getAttribute("data-url");
			const count = await page.evaluate(() => testCopies.length);
			await button.click();
			await page.waitForFunction(count => testCopies.length > count, count);
			assert.deepEqual(await page.evaluate(() => testCopies.slice(-1)), [expected]);
			assert.equal(await page.evaluate(() => testCopies.length), count + 1);
			assert.match(await button.textContent(), /copied/);
		}
		await navigate(page, "/print-Edge/");
		await page.locator(".collapse-toggle-btn").first().waitFor();
		await page.evaluate(() => {
			const block = document.querySelector(".expressive-code.collapsible");
			const clone = block.cloneNode(true); clone.id = "test-cached-code";
			block.replaceWith(clone);
		});
		await page.waitForTimeout(150);
		assert.equal(await page.locator("#test-cached-code .collapse-toggle-btn").count(), 1);
		await page.locator("#test-cached-code .collapse-toggle-btn").click();
		await page.waitForFunction(() => document.querySelector("#test-cached-code").classList.contains("collapsed"));
		const copiesBefore = await page.evaluate(() => testCopies.length);
		await page.locator("#test-cached-code .copy-btn .copy-icon").click();
		await page.waitForFunction(count => testCopies.length === count + 1, copiesBefore);
		assert.ok((await page.evaluate(() => testCopies.at(-1))).trim().length > 0, "复制图标可触发实际备用复制");
		await context.close();
		console.log(`PASS ${mode}: 主题/字号保留，RSS/Atom 重复导航和拒绝剪贴板权限后的复制`);
	}
	const tracks = [1, 2].map(id => ({ name: `Failure ${id}`, artist: "Fixture", url: `https://audio.invalid/${id}.mp3`, pic: new URL("/favicon/favicon.ico", base).href }));
	const { context, page } = await setup("invalid", tracks);
	const requests = [];
	await context.route("https://audio.invalid/**", route => { requests.push(route.request().url()); return route.fulfill({ status: 404, body: "Missing" }); });
	await page.goto(new URL("/archive/", base).href);
	await page.waitForFunction(() => document.querySelector("audio")?.src.endsWith("/2.mp3") && document.querySelector("audio").error);
	assert.equal(await page.evaluate(() => document.querySelector("audio").volume), 1, "损坏音量值被限制到有效范围");
	const settled = requests.length;
	await page.waitForTimeout(2500);
	assert.equal(requests.length, settled, "整张歌单失效后停止自动重试");
	assert.equal(new Set(requests).size, 2, "依次尝试每首歌");
	assert.equal(await page.evaluate(() => document.querySelector("audio").paused), true);
	await context.close();
	assert.deepEqual(errors, []);
	console.log("PASS 全歌单音频失败后有限重试；无未处理脚本异常");
} finally {
	await browser.close();
}
