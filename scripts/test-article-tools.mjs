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
await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.testCopied = value; } } }); });
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//,
	route => route.fulfill({ contentType: "application/javascript", body: "" }));
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
const page = await context.newPage();
const printFiles = [];
async function test(name, callback) { if (only && only !== name) return; await callback(); console.log(`PASS ${name}`); }
try {
	await test("images", async () => {
		const html = parse(await (await fetch(`${base}/STA/`)).text());
		const src = html.querySelector(".markdown-content img").getAttribute("src");
		let broken = true;
		const imagePage = await context.newPage();
		try {
			await imagePage.route(new URL(src, base).href, route => broken ? route.abort() : route.continue());
			await imagePage.goto(`${base}/STA/`);
			const image = imagePage.locator(".markdown-content img").first();
			await image.scrollIntoViewIfNeeded();
			const panel = imagePage.locator(".image-recovery-panel").first();
			await panel.getByRole("button", { name: "重试", exact: true }).waitFor();
			assert.equal(await panel.getByRole("link", { name: "查看原图" }).getAttribute("href"), new URL(src, base).href);
			assert.equal(await panel.evaluate(el => Boolean(el.closest("a"))), false, "Recovery controls never nest inside links");
			broken = false;
			await panel.getByRole("button", { name: "重试", exact: true }).click();
			await image.evaluate(img => img.decode());
			await panel.waitFor({ state: "detached" });
			assert.equal(await imagePage.locator(".image-recovery-frame").count(), 0);
			assert.equal(await image.evaluate(img => getComputedStyle(img).opacity), "1");
			await imagePage.goto(`${base}/`);
			const cover = imagePage.locator("[data-image-recovery] img").first();
			const coverSrc = await cover.getAttribute("src");
			let coverBroken = true;
			await imagePage.route(new URL(coverSrc, base).href, route => coverBroken ? route.abort() : route.continue());
			await imagePage.reload();
			await imagePage.locator("[data-image-recovery] .image-recovery-panel").first().waitFor();
			assert.equal(await imagePage.locator(".image-recovery-panel").first().evaluate(el => Boolean(el.closest("a"))), false);
			assert.ok(await imagePage.locator(".image-recovery-panel a").first().getAttribute("href"));
			coverBroken = false;
			await imagePage.locator(".image-recovery-panel button").first().click();
			await cover.evaluate(img => img.decode());
			await imagePage.locator(".image-recovery-panel").waitFor({ state: "detached" });
			await imagePage.goto(`${base}/STA/`);
			await imagePage.route("https://example.invalid/recovery.png", route => route.abort());
			await imagePage.evaluate(() => {
				const anchor = document.createElement("a"); anchor.href = "https://example.invalid/original";
				const img = document.createElement("img"); img.width = 500; img.height = 250; img.src = "https://example.invalid/recovery.png";
				anchor.append(img); document.querySelector(".markdown-content").append(anchor);
			});
			const external = imagePage.locator('.image-recovery-panel:has(a[href="https://example.invalid/recovery.png"])');
			await external.scrollIntoViewIfNeeded();
			assert.equal(await external.evaluate(el => Boolean(el.closest("a"))), false);
			await external.getByRole("button", { name: "重试", exact: true }).click();
			await external.getByRole("button", { name: "重试", exact: true }).waitFor();
			await imagePage.waitForFunction(() => !document.querySelector(".image-recovery-panel button:disabled"));
		} finally { await imagePage.close(); }
	});
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
			assert.ok(await page.locator("#post-cover img").isVisible(), "Print includes the article cover");
			const quote = page.locator(".markdown-content blockquote").first();
			if (await quote.count()) {
				const border = await quote.evaluate(el => { const style = getComputedStyle(el); return [style.borderInlineStartWidth, style.borderInlineStartStyle, style.borderInlineStartColor]; });
				assert.deepEqual(border, ["3px", "solid", "rgb(209, 213, 219)"], "Quote bar stays light grey even with print backgrounds disabled");
			}
			assert.equal(await page.locator(".markdown-content").evaluate(el => getComputedStyle(el).color), "rgb(17, 17, 17)");
			const box = await page.locator("#post-container").boundingBox();
			assert.ok(box.width > 1200 && box.x < 20, "Article uses printable page width rather than sidebar grid");
			const file = path.join(tmpdir(), `asround-print-${slug}.pdf`);
			printFiles.push(file);
			await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
			console.log("PDF QA", file);
			await page.emulateMedia({ media: "screen" });
			assert.ok(await page.locator("#share-component").isVisible());
		}
	});
	await test("chapters", async () => {
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
		for (const path of ["/STA/", "/posts/2026-10-02_sta/"]) {
			await page.goto(`${base}${path}`);
			await page.waitForFunction(() => document.querySelector("#share-component astro-island") && !document.querySelector("#share-component astro-island").hasAttribute("ssr"));
			const trigger = page.locator("#share-component").getByRole("button", { name: "分享文章", exact: true });
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
			await page.evaluate(() => {
				Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
				document.execCommand = () => { const textarea = document.activeElement; window.testFallbackInDialog = Boolean(textarea.closest("dialog")); return true; };
			});
			await dialog.getByRole("button", { name: /复制链接|已复制/ }).click();
			assert.equal(await page.evaluate(() => window.testFallbackInDialog), true, "Fallback copy uses a focused field inside the modal");
			await page.evaluate(() => { document.execCommand = () => false; });
			await dialog.getByRole("button", { name: /复制链接|已复制/ }).click();
			await dialog.getByRole("status").filter({ hasText: "复制失败，请手动复制" }).waitFor();
			await page.getByRole("button", { name: "关闭分享窗口" }).click();
			assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
			await page.evaluate(() => window.scrollTo(0, 0));
			const toolbarShare = page.locator("#reader-share-button");
			await toolbarShare.waitFor();
			await toolbarShare.focus();
			const scrollBefore = await page.evaluate(() => scrollY);
			const tocWasOpen = await page.locator("#reader-toc-panel").getAttribute("aria-hidden");
			await page.keyboard.press("Enter");
			await dialog.waitFor();
			assert.equal(await page.getByRole("dialog").count(), 1, "Both share entrances open the same single dialog");
			assert.ok(Math.abs(await page.evaluate(() => scrollY) - scrollBefore) < 2, "Toolbar share never scrolls to the footer");
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached" });
			assert.ok(await toolbarShare.evaluate(el => el === document.activeElement), "Focus returns to the toolbar trigger");
			assert.equal(await page.locator("#reader-toc-panel").getAttribute("aria-hidden"), tocWasOpen, "Closing the modal leaves the directory unchanged");
		}
		await page.evaluate(() => window.swup.navigate("/archive/"));
		await page.waitForFunction(() => location.pathname === "/archive/" && !document.querySelector("#post-container"));
		assert.equal(await page.locator("#reader-share-button").count(), 0);
		await page.evaluate(() => window.swup.navigate("/STA/"));
		await page.locator("#reader-share-button").waitFor();
		await page.locator("#reader-share-button").click();
		await page.getByRole("dialog", { name: "分享文章", exact: true }).waitFor();
		await page.keyboard.press("Escape");
	});
	await test("loading", async () => {
		await page.goto(`${base}/STA/`);
		await page.evaluate(() => document.fonts.ready);
		const weights = await page.evaluate(async () => {
			const family = '"TikTokSans-VariableFont_opsz,slnt,wdth,wght"';
			await document.fonts.load(`700 24px ${family}`);
			const context = document.createElement("canvas").getContext("2d");
			context.font = `400 24px ${family}`;
			const regular = context.measureText("STA setup hold Timing Analysis").width;
			context.font = `700 24px ${family}`;
			return { regular, bold: context.measureText("STA setup hold Timing Analysis").width };
		});
		assert.ok(Math.abs(weights.bold - weights.regular) > .1, "Production font must render distinct regular and bold instances");
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
