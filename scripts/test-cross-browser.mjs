import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright-core";
import { browserEvidence, isolateExternalServices } from "./browser-test-utils.mjs";

const args = process.argv.slice(2);
const base = args.find(arg => !arg.startsWith("--")) || "http://localhost:4321";
const names = (args.find(arg => arg.startsWith("--browsers="))?.slice(11) || "chromium,firefox,webkit").split(",");
for (const name of names) {
	assert.ok(["chromium", "firefox", "webkit"].includes(name), `Unsupported engine: ${name}`);
	// Missing browser binaries are failures, never silently counted as passes.
	const browser = await ({ chromium, firefox, webkit }[name]).launch({ headless: true,
		...(name === "chromium" ? { channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" } : {}) });
	try {
		const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
		const evidence = browserEvidence(context, name);
		await isolateExternalServices(context);
		await context.addInitScript(() => {
			// Also exercise browsers with no View Transition API. The real fallback runs.
			Object.defineProperty(document, "startViewTransition", { configurable: true, value: undefined });
		});
		const page = await context.newPage();
		page.setDefaultTimeout(30000);
		await evidence.step(page, "archive-search", async () => {
			await page.goto(`${base}/archive/`);
			await page.waitForFunction(() => !document.querySelector("#archive-keyword")?.disabled);
			await page.getByLabel("筛选文章关键词").fill("STA");
			await page.locator(".archive-filters").getByLabel("匹配大小写", { exact: true }).check();
			await page.locator('a.archive-post[href^="/STA/"]').waitFor();
			assert.ok(await page.locator("a.archive-post mark").count() > 0);
			for (const width of [1440, 960, 720]) {
				await page.setViewportSize({ width, height: 1000 });
				assert.ok(await page.getByLabel("筛选文章关键词").isVisible());
				await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
			}
			await page.setViewportSize({ width: 1440, height: 1000 });
		});
		await evidence.step(page, "search-to-article", async () => {
			await page.locator('a.archive-post[href^="/STA/"]').click();
			await page.locator("mark.article-search-current").waitFor();
			assert.equal(new URL(page.url()).pathname, "/STA/");
			assert.equal(await page.locator("mark.article-search-current").textContent(), "STA");
			await page.getByRole("button", { name: "关闭正文搜索高亮", exact: true }).click();
			await page.getByRole("region", { name: "正文搜索定位" }).waitFor({ state: "detached" });
		});
		await evidence.step(page, "toc-navigation", async () => {
			const link = page.locator('#reader-toc-panel nav a').nth(1);
			await link.waitFor();
			const hash = new URL(await link.getAttribute("href"), base).hash;
			await link.click();
			await page.waitForFunction(hash => location.hash === hash, hash);
			const top = await page.evaluate(hash => document.getElementById(decodeURIComponent(hash.slice(1))).getBoundingClientRect().top, hash);
			assert.ok(top >= 0 && top < 200, `Chapter is visible near viewport top: ${top}`);
		});
		await evidence.step(page, "share-keyboard", async () => {
			const trigger = page.locator("#reader-share-button");
			await trigger.focus(); await page.keyboard.press("Enter");
			const dialog = page.getByRole("dialog", { name: "分享文章", exact: true });
			await dialog.waitFor();
			await page.keyboard.press("Tab");
			assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached" });
			assert.ok(await trigger.evaluate(el => el === document.activeElement));
		});
		await evidence.step(page, "theme-fallback", async () => {
			const wasDark = await page.locator("html").evaluate(el => el.classList.contains("dark"));
			await page.getByRole("button", { name: wasDark ? "切换到浅色模式" : "切换到深色模式", exact: true }).click();
			assert.equal(await page.locator("html").evaluate(el => el.classList.contains("dark")), !wasDark);
			assert.ok(await page.locator(".markdown-content").isVisible());
		});
		await evidence.step(page, "back-restores-archive", async () => {
			// Chapter navigation adds a history entry. Go back through it first.
			for (let i = 0; i < 4 && new URL(page.url()).pathname !== "/archive/"; i++) await page.goBack();
			await page.getByLabel("筛选文章关键词").waitFor();
			await page.waitForFunction(() => !document.querySelector("#archive-keyword")?.disabled);
			assert.equal(await page.getByLabel("筛选文章关键词").inputValue(), "STA");
			assert.ok(await page.locator(".archive-filters").getByLabel("匹配大小写", { exact: true }).isChecked());
			assert.ok(await page.locator('a.archive-post[href^="/STA/"]').count() > 0);
		});
		evidence.assertNoErrors();
	} finally { await browser.close(); }
}
