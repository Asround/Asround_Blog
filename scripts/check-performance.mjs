import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { withBuiltSite } from "./built-site.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const samples = Number(option("samples", "3"));
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 5);
const routes = ["/", "/STA/", "/Summer-camp/"];
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
const baselinePath = "scripts/performance-baseline.json";
async function measure(base) {
	const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
	const rows = [];
	try {
		for (const route of routes) {
			const runs = { cold: [], warm: [] };
			for (let sample = 0; sample < samples; sample++) {
				const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
				try {
					// Isolate first-party cost; music, analytics and authenticated comments vary externally.
					const page = await context.newPage();
					const session = await context.newCDPSession(page);
					await session.send("Network.enable");
					// Playwright routing disables HTTP cache, so use CDP blocking for this loopback-only lab.
					await session.send("Network.setBlockedURLs", { urls: ["https://*"] });
					await session.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 1250000, uploadThroughput: 1250000 });
					await session.send("Emulation.setCPUThrottlingRate", { rate: 2 });
					await page.addInitScript(() => {
						window.lab = { lcp: 0, shifts: [] };
						new PerformanceObserver(list => { for (const entry of list.getEntries()) window.lab.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
						new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.lab.shifts.push({ time: entry.startTime, value: entry.value }); }).observe({ type: "layout-shift", buffered: true });
					});
					for (const cache of ["cold", "warm"]) {
						if (cache === "cold") await page.goto(base + route, { waitUntil: "domcontentloaded" }); else await page.reload({ waitUntil: "domcontentloaded" });
						await page.locator("#swup-container").waitFor({ state: "visible" });
						await page.evaluate(async () => {
							await document.fonts.ready;
							window.lab.textReady = performance.now();
							await Promise.race([
								Promise.all([...document.images].filter(image => { const box = image.getBoundingClientRect(); const style = getComputedStyle(image); return new URL(image.currentSrc || image.src, location.href).origin === location.origin && style.visibility !== "hidden" && style.display !== "none" && box.width > 0 && box.height > 0 && box.top < innerHeight && box.bottom > 0; }).map(async image => { try { await image.decode(); } catch { throw new Error(`Visible first-party image failed: ${image.currentSrc || image.src}`); } })),
								new Promise((_, reject) => setTimeout(() => reject(new Error("Visible images not ready after 45s")), 45000)),
							]);
							window.lab.ready = performance.now();
						});
						await page.waitForTimeout(2000);
						runs[cache].push(await page.evaluate(() => {
							const navigation = performance.getEntriesByType("navigation")[0];
							const resources = performance.getEntriesByType("resource").filter(item => new URL(item.name).origin === location.origin);
							const sum = items => items.reduce((total, item) => total + item.decodedBodySize, 0);
							let cls = 0, windowValue = 0, start = 0, last = 0;
							for (const shift of window.lab.shifts) { if (shift.time-last > 1000 || shift.time-start > 5000) { start=shift.time;windowValue=0; } windowValue+=shift.value; last=shift.time; cls=Math.max(cls,windowValue); }
							return { requests: resources.length + 1, decodedBytes: sum(resources) + navigation.decodedBodySize,
								scriptBytes: sum(resources.filter(item => new URL(item.name).pathname.endsWith(".js"))),
								fontBytes: sum(resources.filter(item => /\.(?:woff2?|ttf)$/.test(new URL(item.name).pathname))),
								imageBytes: sum(resources.filter(item => /\.(?:png|jpe?g|webp|avif|svg)$/.test(new URL(item.name).pathname))),
								transferBytes: resources.reduce((total,item)=>total+item.transferSize, navigation.transferSize),
								textReadyMs: Math.round(window.lab.textReady), readyMs: Math.round(window.lab.ready), lcpMs: Math.round(window.lab.lcp), cls: Math.round(cls*10000)/10000,
								largest: resources.toSorted((a,b)=>b.decodedBodySize-a.decodedBodySize).slice(0,5).map(item=>({ path: new URL(item.name).pathname, bytes: item.decodedBodySize })) };
						}));
					}
				} finally { await context.close(); }
			}
			for (const cache of ["cold", "warm"]) {
				const row = { route, cache, ...Object.fromEntries(Object.keys(runs[cache][0]).filter(key=>key!=="largest").map(key => [key, median(runs[cache].map(run=>run[key]))])), largest: runs[cache][0].largest };
				rows.push(row); console.log(`PERFORMANCE ${JSON.stringify(row)}`);
			}
		}
	} finally { await browser.close(); }
	const report = { schema: 1, measuredAt: new Date().toISOString(), environment: { viewport: "1440x1000", samples, cpuSlowdown: 2, latencyMs: 40, megabitsPerSecond: 10, thirdParty: "blocked", duration: "fonts and visible images ready + 2s" }, rows };
	if (option("report")) await writeFile(option("report"), JSON.stringify(report, null, 2) + "\n");
	if (args.includes("--record")) {
		assert.ok(samples >= 3, "Record at least 3 samples; never replace a baseline with one noisy run");
		await writeFile(baselinePath, JSON.stringify(report, null, 2) + "\n");
		console.log("Recorded performance baseline; review its diff before committing.");
	} else if (!args.includes("--no-budget")) {
		const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
		for (const row of rows.filter(row => row.cache === "cold")) {
			const prior = baseline.rows.find(item => item.route === row.route && item.cache === row.cache);
			assert.ok(prior, `Missing baseline: ${row.route}`);
			for (const key of ["decodedBytes", "scriptBytes", "fontBytes", "imageBytes"]) assert.ok(row[key] <= prior[key] * 1.25 + 16384, `${row.route} ${key}: ${row[key]} exceeds baseline ${prior[key]} by >25% +16KiB`);
			assert.ok(row.requests <= prior.requests * 1.25 + 3, `${row.route}: request count regression`);
			assert.ok(row.cls <= Math.max(.1, prior.cls + .03), `${row.route}: layout shift regression ${row.cls}`);
			if (row.readyMs > prior.readyMs * 2 + 1000 || row.lcpMs > prior.lcpMs * 2 + 1000) console.warn(`Timing advisory ${row.route}: compare several runs; CI speed is not a field performance measurement.`);
		}
		console.log("PASS performance budgets: first-party decoded bytes, requests and layout stability");
	}
	return report;
}
const base = option("base");
if (base) assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname) && new URL(base).protocol === "http:", "Performance lab requires an HTTP loopback server");
if (base) await measure(base); else await withBuiltSite(measure, option("site", "dist"));
