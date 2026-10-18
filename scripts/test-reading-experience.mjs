import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";
import { parse } from "node-html-parser";
import { auditProject, importTS } from "./check-content.mjs";

const args = process.argv.slice(2);
const base = args.find(arg => !arg.startsWith("--")) || "http://localhost:4321";
const only = args.find(arg => arg.startsWith("--only="))?.slice(7);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//,
	route => route.fulfill({ contentType: "application/javascript", body: "" }));
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
const page = await context.newPage();
async function test(name, callback) {
	if (only && only !== name) return;
	await callback();
	console.log(`PASS ${name}`);
}
try {
	await test("edges", async () => {
		const { devicesData } = await importTS(await readFile("src/data/devices.ts", "utf8"));
		const initial = parse(await (await fetch(`${base}/devices/`)).text());
		assert.equal(initial.querySelector("#devices-container .device-card").tagName, "ARTICLE");
		assert.equal(initial.querySelectorAll('#devices-container a[href=""]').length, 0);
		await page.goto(`${base}/404/`);
		await page.getByRole("link", { name: "搜索文章", exact: true }).click();
		await page.waitForURL(`${base}/archive/#archive-keyword`);
		await page.waitForFunction(() => document.activeElement?.id === "archive-keyword" && !document.activeElement.disabled);
		await page.goto(`${base}/devices/`);
		await page.waitForFunction(() => window.swup);
		for (const [brand, devices] of Object.entries(devicesData)) {
			await page.getByRole("button", { name: brand, exact: true }).click();
			assert.equal(await page.locator("#devices-container > .device-card").count(), devices.length);
			const cards = await page.locator("#devices-container > .device-card").evaluateAll(cards => cards.map(card => ({ tag: card.tagName, href: card.getAttribute("href"), cursor: getComputedStyle(card).cursor })));
			for (let i = 0; i < devices.length; i++) {
				assert.equal(cards[i].tag, devices[i].link.trim() ? "A" : "ARTICLE");
				assert.equal(cards[i].href, devices[i].link.trim() ? devices[i].link : null);
				if (!devices[i].link.trim()) assert.notEqual(cards[i].cursor, "pointer");
			}
		}
		await page.getByRole("button", { name: "PC", exact: true }).click();
		assert.equal(await page.locator("#devices-container article .device-action").first().isVisible(), false);
	});
	await test("carousel", async () => {
		const carouselPage = await context.newPage();
		try {
			await carouselPage.clock.install();
			await carouselPage.addInitScript(() => {
				const intervals = new Set();
				const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
				window.setInterval = (...args) => { const id = set(...args); if (args[1] === 3000) intervals.add(id); return id; };
				window.clearInterval = id => { intervals.delete(id); clear(id); };
				window.testCarouselIntervals = () => intervals.size;
			});
			await carouselPage.goto(`${base}/`);
			await carouselPage.mouse.move(1400, 950);
			await carouselPage.waitForFunction(() => window.swup && document.querySelector("#banner-carousel[data-carousel-initialized]") && !document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			const slide = () => carouselPage.locator("#banner-carousel .carousel-item").evaluateAll(items => items.findIndex(item => item.classList.contains("opacity-100")));
			let before = await slide();
			await carouselPage.clock.fastForward(3500);
			assert.notEqual(await slide(), before, "Visible carousel advances");
			await carouselPage.evaluate(() => scrollTo({ top: 1600, behavior: "instant" }));
			await carouselPage.waitForFunction(() => document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			before = await slide();
			await carouselPage.clock.fastForward(10000);
			assert.equal(await slide(), before, "Offscreen carousel stops");
			assert.equal(await carouselPage.locator("#header-waves use").first().evaluate(el => getComputedStyle(el).animationPlayState), "paused");
			await carouselPage.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
			await carouselPage.waitForFunction(() => !document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			await carouselPage.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
			before = await slide();
			await carouselPage.clock.fastForward(10000);
			assert.equal(await slide(), before, "Background visibility event stops carousel");
			await carouselPage.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
			await carouselPage.clock.fastForward(3500);
			assert.notEqual(await slide(), before, "Visibility restores carousel");
			await carouselPage.emulateMedia({ reducedMotion: "reduce" });
			await carouselPage.waitForFunction(() => document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			before = await slide();
			await carouselPage.clock.fastForward(10000);
			assert.equal(await slide(), before, "Reduced motion stops carousel");
			await carouselPage.emulateMedia({ reducedMotion: "no-preference" });
			await carouselPage.waitForFunction(() => !document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			assert.equal(await carouselPage.evaluate(() => window.testCarouselIntervals()), 1);
			await carouselPage.evaluate(() => { window.testBanner = document.getElementById("banner-carousel"); swup.navigate("/archive/"); });
			await carouselPage.waitForURL(`${base}/archive/`);
			await carouselPage.clock.fastForward(2000);
			assert.equal(await carouselPage.evaluate(() => window.testBanner === document.getElementById("banner-carousel")), true);
			assert.ok(await carouselPage.evaluate(() => window.testCarouselIntervals() <= 1), "No duplicate carousel intervals on navigation");
		} finally { await carouselPage.close(); }
	});
	await test("series", async () => {
		const { readingSeries } = await importTS(await readFile("src/data/reading-series.ts", "utf8"));
		const { articles } = await auditProject();
		const ids = new Set();
		for (const group of readingSeries) for (const id of group.posts) {
			assert.ok(!ids.has(id), "An article belongs to only one curated reading group");
			ids.add(id);
			const post = articles.find(post => post.id === id);
			assert.ok(post && !post.data.draft && !post.data.encrypted, `Published article: ${id}`);
			const response = await fetch(new URL(post.url, base));
			assert.equal(response.status, 200);
			const nav = parse(await response.text()).querySelector(".reading-series");
			assert.ok(nav?.querySelector('[aria-current="page"]')?.text.includes(post.data.title));
			const expected = group.posts.filter(other => other !== id).map(other => articles.find(post => post.id === other).url);
			assert.deepEqual(nav.querySelectorAll("a[href]").map(link => link.getAttribute("href")), expected);
		}
		await page.goto(`${base}/STA/`);
		await page.locator('.reading-series a[href="/IC-3rd-Year/"]').click();
		await page.waitForURL(`${base}/IC-3rd-Year/`);
		assert.equal(await page.locator('.reading-series [aria-current="page"]').count(), 1);
		await page.goto(`${base}/Summer-camp/`);
		assert.equal(await page.locator(".reading-series").count(), 0);
	});
	await test("resume", async () => {
		await page.goto(`${base}/STA/`);
		await page.waitForFunction(() => window.swup);
		const heading = await page.locator(".markdown-content :is(h1,h2,h3,h4)[id]").nth(8).getAttribute("id");
		await page.mouse.move(600, 600);
		await page.mouse.wheel(0, 1);
		await page.evaluate(id => {
			const el = document.getElementById(id);
			window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 120, behavior: "instant" });
		}, heading);
		await page.waitForFunction(() => JSON.parse(localStorage.getItem("reader-progress-v1") || "{}")["/STA/"]?.heading);
		const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("reader-progress-v1"))["/STA/"].heading);
		await page.goto(`${base}/archive/`);
		await page.goto(`${base}/STA/`);
		await page.locator("[data-reading-resume]").waitFor({ state: "visible" });
		await page.locator("[data-resume-continue]").click();
		await page.waitForFunction(id => Math.abs(document.getElementById(id).getBoundingClientRect().top - 120) < 8, saved);
		assert.equal(await page.locator("[data-reading-resume]").isVisible(), false);
		await page.goto(`${base}/STA/#${encodeURIComponent(heading)}`);
		await page.waitForFunction(() => window.swup);
		assert.equal(await page.locator("[data-reading-resume]").isVisible(), false, "Explicit fragments suppress resume");
		await page.goto(`${base}/STA/`);
		await page.locator("[data-reading-resume]").waitFor({ state: "visible" });
		await page.locator("[data-resume-dismiss]").click();
		assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("reader-progress-v1"))["/STA/"]), undefined);
		await page.evaluate(() => localStorage.setItem("reader-progress-v1", "invalid JSON"));
		await page.goto(`${base}/STA/`);
		await page.waitForFunction(() => window.swup);
		assert.equal(await page.locator("[data-reading-resume]").isVisible(), false);
		await page.evaluate(() => localStorage.setItem("reader-progress-v1", JSON.stringify({ "/STA/": { heading: "deleted-chapter", updatedAt: Date.now() } })));
		await page.goto(`${base}/STA/`);
		await page.waitForFunction(() => JSON.parse(localStorage.getItem("reader-progress-v1"))["/STA/"] === undefined);
		await page.goto(`${base}/PDF-decrypt/`);
		await page.waitForFunction(() => window.swup);
		assert.equal(await page.locator("[data-reading-resume]").isVisible(), false, "Short article has no resume prompt");
	});
	await test("archive", async () => {
		const staticContext = await browser.newContext({ javaScriptEnabled: false });
		try {
			const staticPage = await staticContext.newPage();
			await staticPage.goto(`${base}/archive/`);
			assert.ok(await staticPage.locator("a.archive-post").count() > 10, "Static archive links exist without JavaScript");
			assert.equal(await staticPage.locator("#archive-keyword").isDisabled(), true);
			assert.ok(await staticPage.locator('a.archive-post[href="/STA/"]').count());
		} finally { await staticContext.close(); }
		await page.goto(`${base}/archive/?q=STA&matchCase=true`);
		await page.waitForFunction(() => !document.getElementById("archive-keyword")?.disabled);
		assert.equal(await page.locator("#archive-keyword").inputValue(), "STA");
		assert.ok(await page.locator(".archive-post mark").count());
		await page.reload();
		await page.waitForFunction(() => document.querySelector(".archive-post mark"));
		await page.getByRole("button", { name: "清除筛选" }).click();
		assert.ok(await page.locator("a.archive-post").count() > 10);
		await page.getByLabel("筛选分类").selectOption({ index: 1 });
		const category = await page.getByLabel("筛选分类").inputValue();
		assert.ok(new URL(page.url()).searchParams.get("category") === category);
		await page.getByRole("button", { name: "清除筛选" }).click();
		for (const width of [960, 768, 640]) {
			await page.setViewportSize({ width, height: 900 });
			assert.ok(await page.locator("#archive-keyword").isVisible());
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
		}
		await page.setViewportSize({ width: 1440, height: 1000 });
	});
	await test("keyboard", async () => {
		await page.goto(`${base}/archive/`);
		await page.keyboard.press("Tab");
		assert.equal(await page.locator(".skip-to-content").evaluate(el => el === document.activeElement), true);
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.activeElement?.id === "swup-container");
		for (const key of ["Enter", "Space"]) {
			await page.locator("#search-toggle").focus();
			await page.keyboard.press(key);
			await page.waitForFunction(() => document.activeElement?.id === "search-input-desktop");
			await page.locator("#search-input-desktop").fill("STA");
			await page.locator("#search-panel a").first().waitFor();
			await page.keyboard.press("Escape");
			assert.equal(await page.locator("#search-toggle").evaluate(el => el === document.activeElement), true);
			assert.equal(await page.locator("#search-panel").evaluate(el => el.inert), true);
		}
		await page.setViewportSize({ width: 800, height: 900 });
		await page.locator("#search-switch").focus();
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.activeElement?.closest("#search-bar-inside"));
		await page.keyboard.press("Escape");
		assert.equal(await page.locator("#search-switch").evaluate(el => el === document.activeElement), true);
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto(`${base}/STA/`);
		await page.waitForFunction(() => document.getElementById("reader-toc-toggle")?.getAttribute("aria-expanded") === "true");
		await page.locator("#search-toggle").focus();
		await page.keyboard.press("Enter");
		await page.waitForFunction(() => document.activeElement?.id === "search-input-desktop");
		await page.keyboard.press("Escape");
		assert.equal(await page.locator("#reader-toc-toggle").getAttribute("aria-expanded"), "true", "Search Escape leaves the article directory open");
	});
	assert.deepEqual(errors, [], "No browser exceptions");
} finally { await browser.close(); }
