import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { withBuiltSite } from "./built-site.mjs";
import { auditProject, importTS } from "./check-content.mjs";

const { matchesSearchText } = await importTS(await readFile("src/utils/search-utils.ts", "utf8"));
const args = process.argv.slice(2);
const external = args.find(arg => arg.startsWith("--base="))?.slice(7);
const site = args.find(arg => arg.startsWith("--site="))?.slice(7) || "dist";
const indexOnly = args.includes("--only=index");
async function check(base) {
	const { articles, issues } = await auditProject();
	assert.equal(issues.filter(issue => issue.level === "error").length, 0);
	const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const errors = [], failedSearch = [];
	await context.route("**/*", route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
	const page = await context.newPage();
	page.on("pageerror", error => errors.push(error.message));
	page.on("response", response => { if (response.url().includes("/pagefind/") && !response.ok()) failedSearch.push(response.url()); });
	try {
		await page.goto(`${base}/STA/`);
		await page.waitForFunction(() => typeof window.pagefind?.search === "function");
		const indexed = await page.evaluate(async () => {
			const found = await window.pagefind.search("STA");
			return Promise.all(found.results.map(result => result.data()));
		});
		assert.ok(indexed.length > 0, "Real generated Pagefind index returns STA results");
		const paths = indexed.map(result => new URL(result.url, base).pathname);
		assert.equal(new Set(paths).size, paths.length, "No duplicate indexed article");
		for (const pathname of paths) {
			const post = articles.find(post => post.paths.includes(decodeURIComponent(pathname)));
			assert.ok(post && !post.data.draft && !post.data.encrypted, `Indexed public article: ${pathname}`);
			assert.equal(decodeURIComponent(pathname), post.url, "Only canonical article paths belong in the final index");
		}
		console.log(`PASS production index: ${indexed.length} canonical STA results`);
		if (indexOnly) return;
		await page.locator("#search-toggle").click();
		const input = page.locator("#search-input-desktop");
		// This phrase occurs in the body, outside the title, tags and description.
		await input.fill("雷打不动");
		const bodyResult = page.locator('#search-panel a[href*="highlight="]').filter({ hasText: "时序分析" });
		await bodyResult.waitFor();
		assert.equal(new URL(await bodyResult.getAttribute("href"), base).pathname, "/STA/");
		assert.ok(await bodyResult.locator("mark").count() > 0, "Real result excerpt highlights the body query");
		await bodyResult.click();
		await page.waitForFunction(() => new URL(location.href).searchParams.get("highlight") === "雷打不动" && !!document.querySelector("mark.article-search-current"));
		assert.equal(await page.locator("mark.article-search-current").textContent(), "雷打不动");
		await page.getByRole("button", { name: "关闭正文搜索高亮", exact: true }).click();
		assert.equal(new URL(page.url()).searchParams.has("highlight"), false);
		await page.locator("#search-toggle").click();
		await input.fill("STA");
		await page.waitForFunction(count => document.querySelectorAll('#search-panel a[href*="highlight=STA"]').length === count, indexed.length);
		const strict = indexed.filter(result => {
			const post = articles.find(post => post.paths.includes(decodeURIComponent(new URL(result.url, base).pathname)));
			return matchesSearchText([result.content || "", result.meta.title, post?.data.title || "", post?.data.description || "", ...(post?.data.tags || [])].join(" "), "STA", true);
		});
		assert.ok(strict.length > 0);
		await page.locator("#search-panel input[type=checkbox]").check();
		await page.waitForFunction(count => document.querySelectorAll('#search-panel a[href*="highlightCase=1"]').length === count, strict.length);
		const strictLinks = await page.locator("#search-panel a").evaluateAll(links => links.map(link => link.href));
		assert.deepEqual(strictLinks.map(url => new URL(url).pathname).sort(), strict.map(result => new URL(result.url, base).pathname).sort());
		await page.locator('#search-panel a[href^="/STA/"]').click();
		await page.waitForFunction(() => !!document.querySelector("mark.article-search-match"));
		assert.ok((await page.locator("mark.article-search-match").allTextContents()).every(text => text === "STA"));
		const before = await page.locator("mark.article-search-current").evaluate(el => [...document.querySelectorAll("mark.article-search-match")].indexOf(el));
		await page.getByRole("button", { name: "下一个命中", exact: true }).click();
		const after = await page.locator("mark.article-search-current").evaluate(el => [...document.querySelectorAll("mark.article-search-match")].indexOf(el));
		assert.notEqual(after, before);
		await page.getByRole("button", { name: "上一个命中", exact: true }).click();
		assert.equal(await page.locator("mark.article-search-current").evaluate(el => [...document.querySelectorAll("mark.article-search-match")].indexOf(el)), before);
		assert.deepEqual(failedSearch, [], "All generated Pagefind resources load");
		assert.deepEqual(errors, [], "No production browser exceptions");
		console.log("PASS production search: body query, deduplication, case matching, excerpts, Swup navigation and body hit controls");
	} finally { await browser.close(); }
}
if (external) await check(external); else await withBuiltSite(check, site);
