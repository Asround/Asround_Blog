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
	await test("albums", async () => {
		const albumPage = await context.newPage();
		let releasePhotos;
		const photosReady = new Promise(resolve => { releasePhotos = resolve; });
		await albumPage.route("**/images/albums/SCU-Album/*.webp", async route => { await photosReady; await route.continue(); });
		const frames = () => albumPage.locator(".photo-gallery").evaluate(gallery => {
			const box = gallery.getBoundingClientRect();
			return [...gallery.querySelectorAll("figure")].map(figure => {
				const rect = figure.getBoundingClientRect();
				return { x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height };
			});
		});
		try {
			await albumPage.emulateMedia({ reducedMotion: "reduce" });
			await albumPage.goto(`${base}/albums/SCU-Album/`, { waitUntil: "domcontentloaded" });
			await albumPage.waitForFunction(() => window.swup);
			await albumPage.evaluate(() => document.fonts.ready);
			await albumPage.locator(".photo-gallery").evaluate(gallery => Promise.all(gallery.getAnimations().map(animation => animation.finished)));
			const placeholders = await frames();
			assert.ok(placeholders.length > 1 && placeholders.every(frame => frame.height > 0), "Reserve photo space before any photo downloads");
			releasePhotos();
			await albumPage.locator(".photo-gallery img").evaluateAll(images => Promise.all(images.map(image => image.decode())));
			const decoded = await frames();
			placeholders.forEach((frame, index) => {
				for (const dimension of ["x", "y", "width", "height"]) assert.ok(Math.abs(frame[dimension] - decoded[index][dimension]) < 1, "Photo loading preserves the reserved layout");
			});
			for (const width of [1440, 960, 720, 390]) {
				await albumPage.setViewportSize({ width, height: 1000 });
				await albumPage.waitForFunction(columns => Number(getComputedStyle(document.querySelector(".photo-gallery")).columnCount) === columns, width <= 480 ? 1 : width <= 768 ? 2 : 3);
				const layout = await albumPage.locator(".photo-gallery").evaluate(gallery => {
					const box = gallery.getBoundingClientRect(), style = getComputedStyle(gallery);
					return { columns: Number(style.columnCount), width: box.width, gap: parseFloat(style.columnGap), overflow: document.documentElement.scrollWidth > innerWidth,
						photos: [...gallery.querySelectorAll("img")].map(image => {
							const rect = image.getBoundingClientRect(), figure = image.closest("figure"), frame = figure.getBoundingClientRect();
							return { x: frame.x - box.x, y: frame.y - box.y, width: rect.width, height: rect.height, frameHeight: frame.height, pieces: figure.getClientRects().length,
								ratio: image.naturalWidth / image.naturalHeight, widthAttribute: Number(image.getAttribute("width")), heightAttribute: Number(image.getAttribute("height")), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
						}) };
				});
				assert.equal(layout.columns, width <= 480 ? 1 : width <= 768 ? 2 : 3);
				assert.equal(layout.overflow, false);
				for (const photo of layout.photos) {
					assert.equal(photo.widthAttribute, photo.naturalWidth);
					assert.equal(photo.heightAttribute, photo.naturalHeight);
					assert.equal(photo.pieces, 1, "A portrait is never split across columns");
					assert.ok(Math.abs(photo.height - photo.width / photo.ratio) < 1, "Preserve the full original aspect ratio");
					assert.ok(Math.abs(photo.frameHeight - photo.height) < 1, "No grid row stretches a landscape frame");
					assert.ok(photo.x >= -1 && photo.x + photo.width <= layout.width + 1);
				}
				const ordered = [...layout.photos].sort((a, b) => a.x - b.x || a.y - b.y);
				for (let i = 1; i < ordered.length; i++) if (Math.abs(ordered[i].x - ordered[i - 1].x) < 1) {
					assert.ok(Math.abs(ordered[i].y - ordered[i - 1].y - ordered[i - 1].height - layout.gap) < 1, "Photos in each column have a single consistent gap");
				}
			}
			await albumPage.setViewportSize({ width: 1440, height: 1000 });
			await albumPage.waitForFunction(() => Number(getComputedStyle(document.querySelector(".photo-gallery")).columnCount) === 3);
			for (const columns of [2, 4, 3]) {
				await albumPage.locator(".photo-gallery").evaluate((gallery, columns) => { gallery.dataset.columns = String(columns); }, columns);
				await albumPage.waitForFunction(columns => Number(getComputedStyle(document.querySelector(".photo-gallery")).columnCount) === columns, columns);
				assert.equal(await albumPage.locator(".photo-gallery").evaluate(gallery => Number(getComputedStyle(gallery).columnCount)), columns);
			}
			await albumPage.emulateMedia({ media: "print" });
			await albumPage.waitForFunction(() => Number(getComputedStyle(document.querySelector(".photo-gallery")).columnCount) === 2);
			assert.equal(await albumPage.locator(".photo-gallery").evaluate(gallery => Number(getComputedStyle(gallery).columnCount)), 2, "Preserve the two-column print layout");
			await albumPage.emulateMedia({ media: "screen" });
			await albumPage.waitForFunction(() => Number(getComputedStyle(document.querySelector(".photo-gallery")).columnCount) === 3);
			const links = albumPage.locator(".photo-gallery a[data-fancybox]");
			for (let index = 0; index < await links.count(); index++) {
				const link = links.nth(index), original = await link.getAttribute("href");
				assert.equal(await link.getAttribute("data-src"), original);
				await link.click();
				const enlarged = albumPage.locator(".fancybox__slide.is-selected .f-panzoom__viewport img.f-panzoom__content").first();
				await enlarged.waitFor();
				assert.equal(await enlarged.getAttribute("src"), original, "Each photo opens its own original");
				await albumPage.keyboard.press("Escape");
				await albumPage.locator(".fancybox__container").waitFor({ state: "hidden" });
			}
			await albumPage.evaluate(() => new Promise(resolve => {
				swup.hooks.on("visit:end", () => resolve(), { once: true, priority: 1000 });
				swup.navigate("/albums/");
			}));
			await albumPage.evaluate(() => history.back());
			await albumPage.waitForURL(`${base}/albums/SCU-Album/`);
			await links.first().click();
			await albumPage.locator(".fancybox__container").waitFor();
			assert.equal(await links.count(), placeholders.length, "Back navigation preserves all photos and lightbox binding");
		} finally { releasePhotos(); await albumPage.close(); }
		for (const id of ["GameGallery_DeathStranding2", "GameGallery_StellarBlade"]) {
			const source = parse(await (await fetch(`${base}/albums/${id}/`)).text());
			const images = source.querySelectorAll(".photo-gallery img");
			assert.ok(source.querySelector('.balanced-layout[data-layout="balanced"]'), "Same-ratio albums retain row order and centered final rows");
			const dimensions = new Map(images.map(image => [image.getAttribute("src"), { width: image.getAttribute("width"), height: image.getAttribute("height") }]));
			const uniformPage = await context.newPage();
			// Only layout is under test here; use the real emitted dimensions without downloading large game screenshots.
			await uniformPage.route(`**/images/albums/${id}/*`, route => {
				const size = dimensions.get(decodeURI(new URL(route.request().url()).pathname)) || { width: 800, height: 600 };
				return route.fulfill({ contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"></svg>` });
			});
			const checkRows = async columns => {
				const rows = await uniformPage.locator(".photo-gallery").evaluate(gallery => {
					const box = gallery.getBoundingClientRect();
					return { width: box.width, frames: [...gallery.querySelectorAll("figure")].map(figure => {
						const rect = figure.getBoundingClientRect();
						return { x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height };
					}) };
				});
				assert.equal(rows.frames.length, images.length);
				for (let start = 0; start < rows.frames.length; start += columns) {
					const row = rows.frames.slice(start, start + columns);
					for (let i = 0; i < row.length; i++) {
						assert.ok(Math.abs(row[i].y - row[0].y) < 1, "Uniform photos stay in their original left-to-right row order");
						assert.ok(Math.abs(row[i].width - rows.frames[0].width) < 1, "An incomplete final row keeps the same photo width");
						assert.ok(row[i].height > 0 && row[i].x >= -1 && row[i].x + row[i].width <= rows.width + 1);
						if (i) assert.ok(row[i].x > row[i - 1].x);
					}
					assert.ok(Math.abs((row[0].x + row.at(-1).x + row.at(-1).width) / 2 - rows.width / 2) < 1, "Every row, including an incomplete final row, is centered");
				}
			};
			try {
				await uniformPage.goto(`${base}/albums/${id}/`);
				await uniformPage.evaluate(() => document.fonts.ready);
				await uniformPage.locator(".photo-gallery").evaluate(gallery => Promise.all(gallery.getAnimations().map(animation => animation.finished)));
				for (const width of [1440, 960, 720, 390]) {
					await uniformPage.setViewportSize({ width, height: 1000 });
					const columns = width <= 480 ? 1 : width <= 768 ? 2 : 3;
					await uniformPage.waitForFunction(columns => Number(getComputedStyle(document.querySelector(".photo-gallery")).getPropertyValue("--album-columns")) === columns, columns);
					await checkRows(columns);
				}
				await uniformPage.setViewportSize({ width: 1440, height: 1000 });
				await uniformPage.waitForFunction(() => innerWidth === 1440 && Number(getComputedStyle(document.querySelector(".photo-gallery")).getPropertyValue("--album-columns")) === 3);
				for (const columns of [2, 4, 3]) {
					await uniformPage.locator(".photo-gallery").evaluate((gallery, columns) => { gallery.dataset.columns = String(columns); }, columns);
					await checkRows(columns);
				}
			} finally { await uniformPage.close(); }
		}
	});
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
		const bannerRequests = [];
		carouselPage.on("request", request => { if (request.resourceType() === "image" && /\/assets\/(?:desktop|mobile)-banner\//.test(request.url())) bannerRequests.push(request.url()); });
		try {
			await carouselPage.clock.install();
			await carouselPage.emulateMedia({ reducedMotion: "reduce" });
			await carouselPage.addInitScript(() => {
				const intervals = new Set();
				const set = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
				window.setInterval = (...args) => { const id = set(...args); if (args[1] === 3000) intervals.add(id); return id; };
				window.clearInterval = id => { intervals.delete(id); clear(id); };
				window.testCarouselIntervals = () => intervals.size;
			});
			await carouselPage.goto(`${base}/`);
			await carouselPage.mouse.move(1400, 950);
			await carouselPage.waitForFunction(() => window.swup && document.querySelector("#banner-carousel[data-carousel-initialized]"));
			const slide = () => carouselPage.locator("#banner-carousel .carousel-item").evaluateAll(items => items.findIndex(item => item.classList.contains("opacity-100")));
			let before = await slide();
			await carouselPage.locator("#banner-carousel .carousel-item.opacity-100 img").evaluate(image=>image.decode());
			assert.equal(bannerRequests.length,1,"Load only the first banner before carousel activity");
			assert.ok(bannerRequests[0].includes("/desktop-banner/"),"Desktop never fetches the mobile banner");
			await carouselPage.emulateMedia({ reducedMotion: "no-preference" });
			await carouselPage.waitForFunction(() => !document.querySelector("#banner-wrapper").classList.contains("banner-paused"));
			await carouselPage.clock.fastForward(3500);
			await carouselPage.waitForFunction(index => [...document.querySelectorAll("#banner-carousel .carousel-item")].findIndex(item=>item.classList.contains("opacity-100")) !== index, before);
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
			await carouselPage.waitForFunction(index => [...document.querySelectorAll("#banner-carousel .carousel-item")].findIndex(item=>item.classList.contains("opacity-100")) !== index, before);
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
		const mobilePage = await context.newPage();
		const mobileRequests = [];
		mobilePage.on("request",request=>{if (request.resourceType() === "image" && /\/assets\/(?:desktop|mobile)-banner\//.test(request.url())) mobileRequests.push(request.url());});
		try {
			await mobilePage.setViewportSize({width:500,height:900});
			await mobilePage.emulateMedia({reducedMotion:"reduce"});
			await mobilePage.goto(`${base}/`);
			await mobilePage.locator("#banner-carousel .carousel-item.opacity-100 img").evaluate(image=>image.decode());
			assert.equal(mobileRequests.length,1);
			assert.ok(mobileRequests[0].includes("/mobile-banner/"),"Mobile selects its original banner without loading desktop images");
			await mobilePage.evaluate(()=>{localStorage.setItem("wallpaperMode","fullscreen");window.dispatchEvent(new CustomEvent("wallpaper-mode-change",{detail:{mode:"fullscreen"}}));});
			await mobilePage.locator('[data-fullscreen-wallpaper] .block.md\\:hidden img').first().evaluate(image=>image.decode());
			assert.ok(mobileRequests.every(url=>url.includes("/mobile-banner/")),"Optional fullscreen mode loads only the active platform");
			await mobilePage.evaluate(()=>{localStorage.removeItem("wallpaperMode");window.dispatchEvent(new CustomEvent("wallpaper-mode-change",{detail:{mode:"banner"}}));});
		} finally { await mobilePage.close(); }
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
		await page.locator("#search-toggle").hover();
		await page.waitForTimeout(400);
		assert.equal(await page.locator("#search-toggle").getAttribute("aria-expanded"), "false", "Hover never opens desktop search");
		await page.locator("#search-toggle").click();
		await page.waitForFunction(() => document.activeElement?.id === "search-input-desktop");
		await page.mouse.move(0, 0);
		assert.equal(await page.locator("#search-toggle").getAttribute("aria-expanded"), "true", "Moving away keeps the clicked search field open");
		await page.keyboard.press("Escape");
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
