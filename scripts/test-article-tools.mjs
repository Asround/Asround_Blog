import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { parse } from "node-html-parser";

const args = process.argv.slice(2);
const base = args.find(arg => !arg.startsWith("--")) || "http://localhost:4321";
const only = args.find(arg => arg.startsWith("--only="))?.slice(7);
assert.ok(!only || ["loading", "modal", "chapters", "print", "images"].includes(only));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ colorScheme: null, viewport: { width: 1440, height: 1000 } });
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//,
	route => route.fulfill({ contentType: "application/javascript", body: "" }));
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
const page = await context.newPage();
async function test(name, callback) { if (only && only !== name) return; await callback(); console.log(`PASS ${name}`); }
try {
	await test("loading", async () => {
		await page.goto(`${base}/STA/`);
		await page.evaluate(() => document.fonts.ready);
		const metrics = await page.evaluate(() => ({
			fonts: performance.getEntriesByType("resource").filter(item => item.name.includes("/assets/font/")).map(item => ({ path: new URL(item.name).pathname, bytes: item.decodedBodySize })),
			family: getComputedStyle(document.body).fontFamily,
			banners: [...document.querySelectorAll("#banner-carousel img")].map(img => [img.getAttribute("width"), img.getAttribute("height")]),
		}));
		assert.ok(metrics.fonts.length >= 2);
		assert.ok(metrics.fonts.every(font => font.path.endsWith(".woff2")), "Use compressed fonts, not full TTF requests");
		assert.ok(metrics.fonts.reduce((sum, font) => sum + font.bytes, 0) < 2000000);
		assert.ok(metrics.family.includes('"TikTokSans-VariableFont_opsz,slnt,wdth,wght"'), "Commas in a configured family remain one font name");
		assert.ok(metrics.banners.every(([w, h]) => Number(w) > 0 && Number(h) > 0));
		assert.equal(await page.locator('#sidebar img[alt="Profile Image of the Author"]').first().getAttribute("width"), "256");
		console.log("Loading metrics", JSON.stringify(metrics));
		const html = parse(await (await fetch(`${base}/STA/`)).text());
		const src = html.querySelector(".markdown-content img").getAttribute("src");
		let release;
		const gate = new Promise(resolve => { release = resolve; });
		const delayedPage = await context.newPage();
		try {
			await delayedPage.route(new URL(src, base).href, async route => { await gate; await route.continue(); });
			await delayedPage.goto(`${base}/STA/`, { waitUntil: "domcontentloaded" });
			await delayedPage.evaluate(() => document.fonts.ready);
			const image = delayedPage.locator(".markdown-content img").first();
			const before = await image.evaluate(img => img.getBoundingClientRect().height);
			assert.ok(before > 0, "Reserve image height before the response arrives");
			release();
			await image.scrollIntoViewIfNeeded();
			await image.evaluate(img => img.decode());
			const after = await image.evaluate(img => img.getBoundingClientRect().height);
			assert.ok(Math.abs(after - before) < 2, `Image load must not shift its block: ${before} -> ${after}`);
		} finally { release(); await delayedPage.close(); }
	});
	assert.deepEqual(errors, [], "No uncaught browser errors");
} finally { await browser.close(); }
