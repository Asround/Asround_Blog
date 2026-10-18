import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { parse } from "node-html-parser";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

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
const printFiles = [];
async function test(name, callback) { if (only && only !== name) return; await callback(); console.log(`PASS ${name}`); }
try {
	await test("print", async () => {
		for (const slug of ["STA", "Summer-camp"]) {
			await page.goto(`${base}/${slug}/`);
			await page.getByRole("button", { name: "打印 / PDF", exact: true }).waitFor();
			await page.evaluate(() => {
				window.print = () => { window.testPrinted = true; window.dispatchEvent(new Event("beforeprint")); window.dispatchEvent(new Event("afterprint")); };
				const detail = document.createElement("details");
				detail.dataset.testPrint = ""; detail.innerHTML = "<summary>Print test</summary><p>Expanded print content</p>";
				document.querySelector(".markdown-content").append(detail);
			});
			await page.getByRole("button", { name: "打印 / PDF", exact: true }).click();
			await page.waitForFunction(() => window.testPrinted);
			assert.equal(await page.locator("[data-test-print]").getAttribute("open"), null, "Restore screen disclosure state after printing");
			await page.locator("[data-test-print]").evaluate(el => el.remove());
			await page.emulateMedia({ media: "print" });
			assert.equal(await page.locator("#sidebar").isVisible(), false);
			assert.equal(await page.locator("#share-component").isVisible(), false);
			assert.equal(await page.locator(".chapter-copy").first().isVisible(), false);
			assert.equal(await page.locator(".markdown-content").evaluate(el => getComputedStyle(el).color), "rgb(17, 17, 17)");
			const box = await page.locator("#post-container").boundingBox();
			assert.ok(box.width > 1200 && box.x < 20, "Article uses printable page width rather than sidebar grid");
			const file = path.join(tmpdir(), `asround-print-${slug}.pdf`);
			printFiles.push(file);
			await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
			console.log("PDF QA", file);
			await page.emulateMedia({ media: "screen" });
			assert.ok(await page.locator("#share-component").isVisible());
		}
	});
	await test("chapters", async () => {
		await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.testCopied = value; } } }); });
		await page.goto(`${base}/STA/`);
		await page.locator(".chapter-copy").first().waitFor({ state: "attached" });
		await page.waitForFunction(() => window.swup);
		const heading = page.locator("#post-container .markdown-content h2[id]").first();
		const id = await heading.getAttribute("id");
		const toc = page.locator(`a[href="#${encodeURIComponent(id)}"]:visible`).filter({ hasNot: page.locator(".anchor-icon") });
		await toc.first().click();
		assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), id);
		await heading.hover();
		await heading.getByRole("button", { name: "复制本节链接" }).click();
		assert.equal(decodeURIComponent(await page.evaluate(() => window.testCopied)), `https://asround-blog.pages.dev/STA/#${id}`);
		assert.equal(await heading.getByRole("button").getAttribute("data-state"), "copied");
		await page.evaluate(() => window.swup.navigate("/archive/"));
		await page.waitForFunction(() => location.pathname === "/archive/" && !document.querySelector("#post-container"));
		await page.goBack();
		await page.locator("#post-container .chapter-copy").first().waitFor({ state: "attached" });
		assert.equal(decodeURIComponent(new URL(page.url()).hash.slice(1)), id);
		await page.goForward();
		await page.waitForFunction(() => location.pathname === "/archive/" && !document.querySelector("#post-container"));
		await page.goto(`${base}/posts/2026-10-02_sta/`);
		const legacy = page.locator(".chapter-copy").first();
		await legacy.waitFor({ state: "attached" });
		await legacy.click({ force: true });
		assert.ok((await page.evaluate(() => window.testCopied)).startsWith("https://asround-blog.pages.dev/STA/#"));
	});
	await test("modal", async () => {
		await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async value => { window.testCopied = value; } } }); });
		for (const path of ["/STA/", "/posts/2026-10-02_sta/"]) {
			await page.goto(`${base}${path}`);
			await page.waitForFunction(() => document.querySelector("#share-component astro-island") && !document.querySelector("#share-component astro-island").hasAttribute("ssr"));
			const trigger = page.getByRole("button", { name: "分享文章", exact: true });
			await trigger.focus(); await page.keyboard.press("Enter");
			const dialog = page.getByRole("dialog", { name: "分享文章", exact: true });
			await dialog.waitFor();
			assert.equal(await page.getByRole("button", { name: "关闭分享窗口" }).evaluate(el => el === document.activeElement), true);
			for (let i = 0; i < 8; i++) {
				await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
				assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), "Native dialog traps keyboard focus");
			}
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached" });
			assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
			await trigger.click();
			await dialog.getByRole("button", { name: "复制链接", exact: true }).click();
			assert.equal(await page.evaluate(() => window.testCopied), "https://asround-blog.pages.dev/STA/");
			await page.getByRole("button", { name: "关闭分享窗口" }).click();
			assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
		}
	});
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
} finally {
	await browser.close();
	if (!args.includes("--keep-print")) for (const file of printFiles) await rm(file, { force: true });
}
