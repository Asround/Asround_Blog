import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { parse } from "node-html-parser";

const base = process.argv[2] || "http://localhost:4321";
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const audioUrl = "https://audio.invalid/asround-navigation-test.wav";
// A silent 120-second WAV exercises actual media loading/playback without music.
const wav = Buffer.alloc(44 + 8000 * 120 * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);

await context.route(audioUrl, (route) => route.fulfill({ contentType: "audio/wav", body: wav }));
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
// Astro's development toolbar re-registers its own audit buttons on navigation.
// It is absent from published builds and must not distort application counters.
await context.route(/\/(?:node_modules\/astro\/dist|@id\/astro)\/runtime\/client\/dev-toolbar\/entrypoint\.js(?:\?|$)/, (route) => route.fulfill({ contentType: "application/javascript", body: "" }));
await context.addInitScript(() => {
	const intervals = new Set();
	const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
	window.setInterval = (...args) => { const id = set(...args); intervals.add(id); return id; };
	window.clearInterval = (id) => { intervals.delete(id); clear(id); };
	window.testIntervalCount = () => intervals.size;
	window.testCopyCalls = 0;
	Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { window.testCopyCalls++; } } });
});

try {
	for (const pathname of ["/archive/", "/STA/", "/Summer-camp/"]) {
		const response = await fetch(new URL(pathname, base), { signal: AbortSignal.timeout(30000) });
		assert.equal(response.status, 200);
		assert.equal(parse(await response.text()).querySelectorAll("audio").length, 0, "服务端页面不输出会激活原生媒体活动的 audio 元素");
	}
	const page = await context.newPage();
	page.on("pageerror", (error) => errors.push(error.message));
	// Read the configured API URL from the actual request, retaining its platform/ID.
	await context.route((url) => url.searchParams.get("type") === "playlist" && url.searchParams.has("server"), (route) => route.fulfill({
		contentType: "application/json", headers: { "access-control-allow-origin": "*" },
		body: JSON.stringify([{ name: "Silent navigation test", artist: "Local fixture", url: audioUrl, pic: new URL("/favicon/favicon.ico", base).href }]),
	}));
	await page.goto(new URL("/archive/", base).href, { waitUntil: "domcontentloaded" });
	await page.waitForFunction((url) => window.swup && document.querySelector("audio")?.src === url && document.querySelector("audio").readyState >= 2, audioUrl);
	await page.locator('.cover-container[role="button"]').click();
	await page.waitForFunction(() => !document.querySelector("audio").paused && document.querySelector("audio").currentTime > 0);
	await page.evaluate(() => { window.testPlayingAudio = document.querySelector("audio"); });
	const session = await context.newCDPSession(page);
	async function navigate(pathname) {
		await page.evaluate((path) => new Promise((resolve, reject) => {
			const timer = setTimeout(() => { swup.hooks.off("visit:end", done); reject(Error(`Navigation timeout: ${path}`)); }, 30000);
			const done = () => { clearTimeout(timer); swup.hooks.off("visit:end", done); resolve(); };
			swup.hooks.on("visit:end", done); swup.navigate(path);
		}), pathname);
	}
	async function measure() {
		await session.send("HeapProfiler.collectGarbage");
		const memory = await session.send("Memory.getDOMCounters");
		const events = await session.send("Runtime.evaluate", {
			expression: "[window,document].map(target=>Object.fromEntries(Object.entries(getEventListeners(target)).map(([type,list])=>[type,list.length])))",
			includeCommandLineAPI: true, returnByValue: true,
		});
		return { ...memory, events: events.result.value, intervals: await page.evaluate(() => window.testIntervalCount()) };
	}
	let baseline;
	for (let cycle = 0; cycle < 16; cycle++) {
		await navigate(cycle % 2 ? "/Summer-camp/" : "/STA/");
		await page.waitForFunction(() => !document.querySelector("#last-modified") || document.querySelector("#modifiedtime")?.textContent.trim());
		await navigate("/archive/");
		await page.waitForTimeout(400);
		const sample = await measure();
		assert.equal(await page.evaluate(() => document.querySelector("audio") === window.testPlayingAudio && !window.testPlayingAudio.paused), true, "站内导航保持同一个播放中的音频元素");
		assert.equal(await page.locator("audio").count(), 1);
		if (cycle === 3) baseline = sample; // Warm up both articles and lazy modules.
		if (cycle >= 4) {
			assert.ok(sample.documents <= baseline.documents + 1, `旧文档未释放: ${sample.documents}`);
			assert.ok(sample.nodes <= baseline.nodes + 500, `归档 DOM 持续增长: ${sample.nodes} > ${baseline.nodes}`);
			assert.ok(sample.jsEventListeners <= baseline.jsEventListeners + 2, `事件监听器持续增长: ${sample.jsEventListeners}`);
			assert.deepEqual(sample.events, baseline.events, "全局事件注册数量稳定");
			assert.equal(sample.intervals, baseline.intervals, "离开文章后时钟不累积");
		}
		if (cycle % 4 === 3) console.log(JSON.stringify({ cycle, documents: sample.documents, nodes: sample.nodes, listeners: sample.jsEventListeners, intervals: sample.intervals }));
	}
	const copies = await page.evaluate(async () => {
		const fixture = document.createElement("pre");
		fixture.innerHTML = '<code>navigation-copy-test</code><button class="copy-btn">Copy</button>';
		document.body.append(fixture);
		fixture.querySelector("button").click();
		await Promise.resolve();
		fixture.remove();
		return window.testCopyCalls;
	});
	assert.equal(copies, 1, "多次切页后复制仍可工作，且一次点击只写入一次测试剪贴板");
	const dropdown = page.locator("[data-dropdown-trigger]").first();
	await dropdown.press("ArrowDown");
	assert.equal(await dropdown.getAttribute("aria-expanded"), "true");
	await dropdown.press("Escape");
	assert.equal(await dropdown.getAttribute("aria-expanded"), "false");
	assert.deepEqual(errors, []);
	console.log("PASS 32 次切页后旧文档、DOM、事件和时钟数量稳定；音乐持续播放且实例不重建");
} finally {
	await context.unrouteAll({ behavior: "ignoreErrors" });
	await browser.close();
}
