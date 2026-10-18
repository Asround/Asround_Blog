import assert from "node:assert/strict";
import { chromium } from "playwright-core";

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
	});
	assert.deepEqual(errors, [], "No browser exceptions");
} finally { await browser.close(); }
