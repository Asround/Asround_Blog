import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { parse } from "node-html-parser";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm, stat } from "node:fs/promises";

const args = process.argv.slice(2);
const base = args.find(arg => !arg.startsWith("--")) || "http://localhost:4321";
const only = args.find(arg => arg.startsWith("--only="))?.slice(7);
assert.ok(!only || ["loading", "modal", "chapters", "print", "images", "search", "responsive", "poster"].includes(only));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
const context = await browser.newContext({ colorScheme: null, viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async value => { window.testCopied = value; } } }); });
// Astro's development toolbar is absent in production and can cover bottom controls.
await context.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
	const style = document.createElement("style"); style.textContent = "astro-dev-toolbar { display: none !important; }"; document.head.append(style);
}));
await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//,
	route => route.fulfill({ contentType: "application/javascript", body: "" }));
const errors = [];
context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
const page = await context.newPage();
const printFiles = [];
async function test(name, callback) { if (only && only !== name) return; await callback(); console.log(`PASS ${name}`); }
function imageRequest(src) {
	const target = new URL(src, base);
	return url => url.href === target.href || (target.pathname === "/_image/" && url.pathname === target.pathname && url.searchParams.get("href") === target.searchParams.get("href"));
}
try {
	await test("poster", async () => {
		const component = "/src/components/misc/SharePoster.svelte";
		const source = await (await fetch(new URL(component, base))).text();
		const runtime = source.match(/from "([^"]*\/svelte\.js[^\"]*)"/)?.[1];
		assert.ok(runtime);
		await page.addInitScript(() => {
			window.posterDraws = [];
			const original = CanvasRenderingContext2D.prototype.fillText;
			CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) {
				const width = this.measureText(text).width;
				const left = this.textAlign === "center" ? x - width / 2 : x;
				window.posterDraws.push({ text, left, right: left + width, y, canvasWidth: this.canvas.width, canvasHeight: this.canvas.height });
				return original.call(this, text, x, y, ...rest);
			};
		});
		await page.route(new URL("/__poster-test__*", base).href, route => {
			const long = new URL(route.request().url()).searchParams.has("long");
			const props = { title: long ? "LongWord".repeat(400) : "数字电路中时序分析的 setup 和 hold 分析", author: long ? "VeryLongAuthor".repeat(30) : "Asround", description: "中文说明与 English words ".repeat(20), pubDate: "2026-10-02", url: "https://asround-blog.pages.dev/STA/", avatar: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="grey"/></svg>' };
			return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<html><body><main></main><script type="module">import {mount} from ${JSON.stringify(runtime)};import Poster from ${JSON.stringify(component)};mount(Poster,{target:document.querySelector('main'),props:${JSON.stringify(props)}});</script></body></html>` });
		});
		for (const suffix of ["", "?long=1"]) {
			await page.goto(`${base}/__poster-test__${suffix}`);
			await page.getByRole("button", { name: "分享文章", exact: true }).click();
			await page.locator('dialog img[alt="Poster"]').waitFor();
			const draws = await page.evaluate(() => window.posterDraws);
			assert.ok(draws.length > 10);
			assert.ok(draws.every(draw => draw.left >= 0 && draw.right <= draw.canvasWidth && draw.y < draw.canvasHeight), "Every canvas text run remains inside the poster");
			if (!suffix) assert.ok(draws.some(draw => draw.text.includes("hold")), "English hold stays a whole word");
			else assert.ok(draws.some(draw => draw.text.endsWith("…")), "Oversized text is visibly truncated");
		}
	});
	await test("responsive", async () => {
		for (const slug of ["STA", "Summer-camp"]) {
			await page.goto(`${base}/${slug}/`);
			const image = page.locator(".markdown-content img[data-article-image]").first();
			await image.scrollIntoViewIfNeeded(); await image.evaluate(img => img.decode());
			const data = await image.evaluate(img => ({ src: img.currentSrc, original: img.dataset.originalSrc, full: img.dataset.src, widths: img.srcset.match(/\d+w/g), size: img.naturalWidth }));
			assert.equal(data.full, data.original);
			assert.ok(data.original && data.widths.length >= 2);
			assert.ok(data.size <= 2560);
			const original = await fetch(new URL(data.original, base));
			assert.ok(original.ok && original.headers.get("content-type").startsWith("image/")); await original.body.cancel();
			await image.click();
			const enlarged = page.locator(".fancybox__slide.is-selected .f-panzoom__viewport img.f-panzoom__content").first();
			await enlarged.waitFor();
			assert.equal(await enlarged.getAttribute("src"), data.original);
			await page.keyboard.press("Escape");
		}
	});
	await test("search", async () => {
		await page.goto(`${base}/STA/?highlight=setup&highlightCase=1`);
		const panel = page.getByRole("region", { name: "正文搜索定位" });
		await panel.waitFor();
		const count = await page.locator("mark.article-search-match").count();
		assert.ok(count > 2);
		assert.equal(await page.locator(".katex mark").count(), 0);
		assert.ok((await page.locator("mark.article-search-match").allTextContents()).every(text => text === "setup"));
		await panel.getByRole("button", { name: "下一个命中" }).click();
		assert.equal(await panel.getByRole("status").textContent(), `2 / ${count}`);
		await panel.getByRole("button", { name: "上一个命中" }).click();
		assert.equal(await panel.getByRole("status").textContent(), `1 / ${count}`);
		await panel.getByRole("button", { name: "关闭正文搜索高亮" }).click();
		assert.equal(await page.locator("mark.article-search-match").count(), 0);
		assert.equal(new URL(page.url()).searchParams.has("highlight"), false);
		await page.goto(`${base}/archive/?q=STA&matchCase=true`);
		const result = page.locator('.archive-post[href*="/STA/"]').first();
		await page.waitForFunction(() => document.querySelector('.archive-post[href*="highlight="]'));
		const target = new URL(await result.getAttribute("href"), base);
		assert.equal(target.searchParams.get("highlight"), "STA");
		assert.equal(target.searchParams.get("highlightCase"), "1");
		await result.click();
		await panel.waitFor();
		await page.waitForFunction(() => window.swup);
		await page.evaluate(() => window.swup.navigate("/archive/"));
		await panel.waitFor({ state: "detached" });
		await page.getByRole("button", { name: "搜索文章", exact: true }).click();
		await page.locator("#search-input-desktop").fill("STA");
		const topResult = page.locator('#search-panel a[href*="/STA/"]').first();
		await topResult.waitFor();
		assert.equal(new URL(await topResult.getAttribute("href"), base).searchParams.get("highlight"), "STA");
		await page.goto(`${base}/STA/?highlight=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
		await panel.waitFor();
		assert.equal(await page.locator('.markdown-content img[src="x"]').count(), 0);
		assert.ok((await panel.getByRole("status").textContent()).includes("正文无匹配"));
	});
	await test("images", async () => {
		const html = parse(await (await fetch(`${base}/STA/`)).text());
		const src = html.querySelector(".markdown-content img").getAttribute("src");
		let broken = true;
		const imagePage = await context.newPage();
		try {
			await imagePage.route(imageRequest(src), route => broken ? route.abort() : route.continue());
			await imagePage.goto(`${base}/STA/`);
			const image = imagePage.locator(".markdown-content img").first();
			await image.scrollIntoViewIfNeeded();
			const panel = imagePage.locator(".image-recovery-panel").first();
			await panel.getByRole("button", { name: "重试", exact: true }).waitFor();
			assert.equal(await panel.getByRole("link", { name: "查看原图" }).getAttribute("href"), new URL(await image.getAttribute("data-original-src") || src, base).href);
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
			const screenSources = await page.locator(".markdown-content img").evaluateAll(images => images.map(img => [img.getAttribute("src"), img.getAttribute("srcset")]));
			await page.evaluate(() => {
				window.print = () => {
					window.testPrinted = true; window.dispatchEvent(new Event("beforeprint"));
					window.testPrintSources = [...document.querySelectorAll('.markdown-content img[data-print-src], #post-cover img[data-print-src]')].map(img => img.getAttribute("src") === img.dataset.printSrc && !img.hasAttribute("srcset"));
					window.dispatchEvent(new Event("afterprint"));
				};
				const detail = document.createElement("details");
				detail.dataset.testPrint = ""; detail.innerHTML = "<summary>Print test</summary><p>Expanded print content</p>";
				document.querySelector(".markdown-content").append(detail);
			});
			await page.getByRole("button", { name: "打印 / PDF", exact: true }).click();
			await page.waitForFunction(() => window.testPrinted);
			assert.ok((await page.evaluate(() => window.testPrintSources)).every(Boolean));
			assert.deepEqual(await page.locator(".markdown-content img").evaluateAll(images => images.map(img => [img.getAttribute("src"), img.getAttribute("srcset")])), screenSources, "Restore responsive reading sources after print");
			assert.equal(await page.locator("[data-test-print]").getAttribute("open"), null, "Restore screen disclosure state after printing");
			await page.evaluate(() => { window.testPrinted = false; });
			await page.locator("#reader-print-button").click();
			await page.waitForFunction(() => window.testPrinted && !document.querySelector('#reader-print-button[aria-busy]'));
			assert.equal(await page.locator("#reader-print-button svg").count(), 1, "Toolbar printing preserves its icon after completion");
			assert.equal(await page.locator("#reader-print-button").getAttribute("title"), "打印 / PDF");
			assert.deepEqual(await page.locator(".markdown-content img").evaluateAll(images => images.map(img => [img.getAttribute("src"), img.getAttribute("srcset")])), screenSources, "Toolbar uses the same restorable print pipeline");
			await page.locator("[data-test-print]").evaluate(el => el.remove());
			await page.emulateMedia({ media: "print" });
			assert.equal(await page.locator(".print-duplicate-title").first().isVisible(), false);
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
			await page.evaluate(async () => {
				window.dispatchEvent(new Event("beforeprint"));
				await Promise.all([...document.querySelectorAll('.markdown-content img, #post-cover img')].map(img => img.decode()));
			});
			await page.pdf({ path: file, preferCSSPageSize: true, printBackground: false });
			const bytes = (await stat(file)).size;
			assert.ok(bytes < 50 * 1024 * 1024, `${slug} PDF exceeds 50 MiB: ${bytes}`);
			console.log("PDF QA", slug, bytes, "bytes");
			await page.emulateMedia({ media: "screen" });
			assert.ok(await page.locator(".print-duplicate-title").first().isVisible(), "Screen title remains unchanged");
			assert.ok(await page.locator("#share-component").isVisible());
		}
		await page.goto(`${base}/STA/`);
		const first = page.locator(".markdown-content img[data-print-src]").first();
		const printSrc = new URL(await first.getAttribute("data-print-src"), base).href;
		const originalSource = await first.getAttribute("src");
		await page.route(printSrc, route => route.abort());
		await page.evaluate(() => { window.testPrinted = false; window.print = () => { window.testPrinted = true; }; });
		await page.locator("#reader-print-button").click();
		await page.getByRole("status").filter({ hasText: "部分图片尚未就绪" }).waitFor();
		assert.equal(await page.locator("#reader-print-button svg").count(), 1, "Toolbar keeps its icon after an image failure");
		assert.equal(await page.evaluate(() => window.testPrinted), false, "Failed print images do not silently create an incomplete PDF");
		assert.equal(await first.getAttribute("src"), originalSource);
		await page.unroute(printSrc);
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
			// A lazy comment iframe can resize the document under a pointer at the footer.
			// Activate this keyboard check by Enter; real pointer activation is tested below on the fixed toolbar.
			await trigger.focus(); await page.keyboard.press("Enter");
			await dialog.waitFor();
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
		const bodyText = html.querySelector("#post-container .markdown-content").text;
		assert.ok(bodyText.includes('"关于"') && bodyText.includes('"CDC"'), "Chinese-adjacent ASCII quotes stay straight on both sides");
		const src = html.querySelector(".markdown-content img").getAttribute("src");
		let release;
		const gate = new Promise(resolve => { release = resolve; });
		const delayedPage = await context.newPage();
		try {
			await delayedPage.route(imageRequest(src), async route => { await gate; await route.continue(); });
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
