import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { readFile } from "node:fs/promises";

// Real local Svelte component + official web component; only the remote service is mocked.
// No fixture route, test configuration, OAuth token or comment is written to the project.
const base = process.argv[2] || "http://localhost:4321";
const componentPath = "/src/components/comment/Giscus.svelte";
const response = await fetch(new URL(componentPath, base));
assert.equal(response.status, 200, "需要正在运行的 Astro 开发服务");
const source = await response.text();
const svelteModule = source.match(/from "([^"]*\/svelte\.js[^\"]*)"/)?.[1];
assert.ok(svelteModule, "应从 Vite 编译结果使用同一 Svelte runtime");
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });
// Let the browser propagate the iframe's scheme; Playwright's default "light"
// emulation overrides prefers-color-scheme in every frame, including nested ones.
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: null });
let mode = "ready";
let requests = 0;
let stylesheetMode = "valid";
const customStylesheet = "https://blog.example/giscus.css";
const enhancementCSS = await readFile(new URL("../public/giscus.css", import.meta.url), "utf8");
await context.route(customStylesheet, (route) => route.fulfill({
	status: stylesheetMode === "missing" ? 404 : 200,
	contentType: stylesheetMode === "html" ? "text/html" : "text/css",
	headers: { "access-control-allow-origin": "*" },
	body: stylesheetMode === "valid" ? enhancementCSS : "Unavailable stylesheet",
}));
const errors = [];
context.on("page", (page) => page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); }));
await context.route("https://giscus.app/**", async (route) => {
	if (new URL(route.request().url()).pathname.endsWith(".css")) {
		await route.fulfill({ contentType: "text/css", headers: { "access-control-allow-origin": "*" }, body: "" });
		return;
	}
	requests++;
	await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html><head><style>
body{background:rgb(255,255,255);color:rgb(0,0,0)}
textarea{box-sizing:border-box;min-height:100px;max-height:500px;width:95%;padding:8px;line-height:20px;resize:vertical}
@media(prefers-color-scheme:dark){body{background:rgb(13,17,23);color:rgb(255,255,255)}}
</style></head><body>
<form class="gsc-comment-box"><textarea class="gsc-comment-box-textarea" placeholder="Write a comment" aria-label="test-draft"></textarea></form><script>
const textarea=document.querySelector('textarea');
textarea.addEventListener('input',()=>{textarea.style.height='0px';textarea.style.height=textarea.scrollHeight+'px';});
const theme=new URL(location.href).searchParams.get('theme');
if(theme?.startsWith('https://')){const link=document.createElement('link');link.rel='stylesheet';link.crossOrigin='anonymous';link.href=theme;document.head.append(link);}
window.addEventListener('message',e=>{if(e.data?.giscus?.setConfig)document.body.dataset.theme=e.data.giscus.setConfig.theme;});
${mode === "ready" ? "parent.postMessage({giscus:{resizeHeight:200}},'*');" : ""}
</script></body></html>` });
});
await context.route(new URL("/__comment-test__**", base).href, async (route) => {
	await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html class="dark"><head>
<meta name="giscus:backlink" content="https://asround-blog.pages.dev/STA/">
</head><body style="margin:0"><div style="height:3500px">Article fixture</div><main></main>
<script type="module">
import {mount,unmount} from ${JSON.stringify(svelteModule)};
import Comments from ${JSON.stringify(componentPath)};
const props={config:{repo:'owner/comments',repoId:'R_example',category:'文章评论',categoryId:'DIC_example'},term:'/STA/',discussionsUrl:'https://github.com/owner/comments/discussions',stylesheetUrl:new URL(location.href).searchParams.get('stylesheet')||undefined};
window.mountComments=(term='/STA/')=>{window.component=mount(Comments,{target:document.querySelector('main'),props:{...props,term}})};
window.removeComments=()=>unmount(window.component);
history.replaceState({source:'swup',url:location.pathname+location.search},'',location.href);
window.mountComments();
</script></body></html>` });
});

async function fixture(query = "", initialize) {
	const page = await context.newPage();
	if (initialize) await initialize(page);
	await page.goto(new URL(`/__comment-test__${query}`, base).href);
	await page.waitForSelector("#article-comments");
	return page;
}
const widgetCount = async (page) => page.locator("giscus-widget").count();
try {
	let page = await fixture();
	assert.equal(await widgetCount(page), 0, "未接近文章底部时不加载");
	await page.evaluate(() => scrollTo(0, document.querySelector("#article-comments").offsetTop - innerHeight - 200));
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef?.contentWindow);
	await page.waitForFunction(() => !document.querySelector('[aria-live]').textContent.trim());
	assert.equal(await widgetCount(page), 1);
	let frame = page.frames().find((frame) => frame.url().startsWith("https://giscus.app/"));
	assert.ok(frame);
	const frameUrl = new URL(frame.url());
	assert.equal(frameUrl.searchParams.get("term"), "/STA/");
	assert.equal(frameUrl.searchParams.get("strict"), "1");
	assert.equal(frameUrl.searchParams.get("category"), "文章评论");
	assert.equal(frameUrl.searchParams.get("theme"), "preferred_color_scheme");
	assert.equal(frameUrl.searchParams.get("backLink"), "https://asround-blog.pages.dev/STA/");
	await frame.locator("textarea").fill("保持未发布草稿 $x^2$");
	const before = requests;
	await frame.waitForFunction(() => matchMedia("(prefers-color-scheme: dark)").matches);
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await frame.waitForFunction(() => !matchMedia("(prefers-color-scheme: dark)").matches && getComputedStyle(document.body).backgroundColor === "rgb(255, 255, 255)");
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await frame.waitForFunction(() => matchMedia("(prefers-color-scheme: dark)").matches && getComputedStyle(document.body).backgroundColor === "rgb(13, 17, 23)");
	assert.equal(requests, before, "切主题不重建 iframe");
	assert.equal(await frame.locator("body").getAttribute("data-theme"), "preferred_color_scheme", "切换时不发送替换远端主题的配置");
	assert.equal(await frame.locator("textarea").inputValue(), "保持未发布草稿 $x^2$");
	await page.evaluate(() => {
		document.documentElement.classList.add("theme-circle-transition");
		document.documentElement.classList.remove("dark");
	});
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await frame.evaluate(() => matchMedia("(prefers-color-scheme:dark)").matches), true, "旧快照捕获完成前保留旧配色");
	await page.evaluate(() => document.dispatchEvent(new Event("theme:transition-update")));
	await frame.waitForFunction(() => !matchMedia("(prefers-color-scheme:dark)").matches);
	await page.evaluate(() => {
		document.documentElement.classList.remove("theme-circle-transition");
		document.documentElement.classList.add("dark");
	});
	await frame.waitForFunction(() => matchMedia("(prefers-color-scheme:dark)").matches);
	await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", { origin: "https://giscus.app", source: window, data: { giscus: { error: "forged" } } })));
	assert.equal(await widgetCount(page), 1, "忽略错误来源的消息");
	await frame.evaluate(() => parent.postMessage({ giscus: { error: "Discussion not found" } }, "*"));
	assert.equal(await widgetCount(page), 1, "空讨论仍保留编辑器");
	await frame.evaluate(() => parent.postMessage({ giscus: { error: "Repository not found" } }, "*"));
	await page.getByText("暂时无法连接评论服务。").waitFor();
	assert.equal(await widgetCount(page), 0);
	await page.getByRole("button", { name: "重新加载" }).click();
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef?.contentWindow);
	await page.waitForFunction(() => !document.querySelector('[aria-live]').textContent.trim());
	await page.evaluate(() => window.removeComments());
	assert.equal(await widgetCount(page), 0);
	await page.evaluate(() => window.mountComments("/another/"));
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.term === "/another/");
	assert.equal(await widgetCount(page), 1, "离开后再进入只保留一个新实例");
	await page.close();
	console.log("PASS 延迟加载、严格映射、正式回链、主题及草稿保留、消息来源、空讨论、失败重试、卸载与重新进入");

	mode = "silent";
	page = await fixture();
	await page.clock.install();
	await page.evaluate(() => scrollTo(0, 3500));
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef);
	await page.clock.fastForward(21000);
	await page.getByText("暂时无法连接评论服务。").waitFor();
	assert.equal(await widgetCount(page), 0, "超时清理旧实例");
	mode = "ready";
	await page.getByRole("button", { name: "重新加载" }).click();
	await page.clock.runFor(100);
	await page.waitForFunction(() => !document.querySelector('[aria-live]').textContent.trim());
	await page.close();
	console.log("PASS 远端无响应超时、重新加载恢复");

	page = await fixture("?giscus=test-local-callback");
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef);
	assert.equal(await page.evaluate(() => new URL(location.href).searchParams.has("giscus")), false);
	assert.equal(await page.evaluate(() => history.state.source), "swup");
	assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("giscus-session"))), "test-local-callback");
	await page.evaluate(() => localStorage.removeItem("giscus-session"));
	await page.close();
	console.log("PASS 模拟 OAuth 回调及时处理且保留 Swup 历史状态（未进行真实授权）");

	page = await fixture("", (page) => page.addInitScript(() => { delete window.IntersectionObserver; }));
	await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef);
	await page.waitForFunction(() => !document.querySelector('[aria-live]').textContent.trim());
	await page.close();
	console.log("PASS 不支持 IntersectionObserver 时仍可加载评论");

	let releaseImport;
	let importRequested;
	const requested = new Promise((resolve) => { importRequested = resolve; });
	page = await fixture("", async (page) => {
		await page.route(/\/giscus\.js(?:\?|$)/, async (route) => {
			await new Promise((resolve) => { releaseImport = resolve; importRequested(); });
			await route.continue();
		});
	});
	await page.evaluate(() => scrollTo(0, 3500));
	await Promise.race([requested, new Promise((_, reject) => setTimeout(() => reject(new Error("未拦截到官方组件导入")), 10000))]);
	const priorRequests = requests;
	await page.evaluate(() => window.removeComments());
	releaseImport();
	await page.waitForFunction(() => customElements.get("giscus-widget"));
	assert.equal(await widgetCount(page), 0);
	assert.equal(requests, priorRequests, "离开后晚到的导入不得加载 iframe");
	await page.close();
	console.log("PASS 导入尚未完成时离开页面，不遗留实例或远端请求");

	for (const variant of ["valid", "missing", "html"]) {
		stylesheetMode = variant;
		page = await fixture("?stylesheet=" + encodeURIComponent(customStylesheet));
		await page.evaluate(() => scrollTo(0, 3500));
		await page.waitForFunction(() => document.querySelector("giscus-widget")?.iframeRef);
		frame = await (await page.locator("giscus-widget").locator("iframe").elementHandle()).contentFrame();
		await frame.locator("textarea").waitFor();
		assert.equal(new URL(frame.url()).searchParams.get("theme"), variant === "valid" ? customStylesheet : "preferred_color_scheme");
		if (variant === "valid") {
			await frame.waitForFunction(() => getComputedStyle(document.querySelector("textarea")).minHeight === "100px");
			const editor = frame.locator("textarea");
			const height = () => editor.evaluate((element) => element.getBoundingClientRect().height);
			assert.equal(await height(), 100, "空输入框恢复官方默认高度");
			await editor.fill("Short draft");
			assert.equal(await height(), 100);
			await editor.fill("Long draft line\n".repeat(16));
			assert.ok(await height() > 100, "输入行数增加时自动变高");
			const expanded = await height();
			await editor.evaluate((element) => { element.disabled = true; });
			assert.equal(await height(), expanded, "等待发送时不折叠非空输入框");
			await editor.evaluate((element) => { element.disabled = false; });
			assert.equal(await editor.inputValue(), "Long draft line\n".repeat(16), "失败后保留未清空的草稿");
			await editor.fill("Long draft line\n".repeat(100));
			assert.equal(await height(), 500, "长评论达到上限后内部滚动");
			assert.ok(await editor.evaluate((element) => element.scrollHeight > element.clientHeight));
			// Giscus resets the controlled value after success without firing input.
			await editor.evaluate((element) => { element.value = ""; });
			assert.equal(await height(), 100, "程序清空后也折回，不依赖输入事件");
			await editor.fill("Another draft\n".repeat(12));
			assert.ok(await height() > 100, "清空后可继续自动增高");
			await editor.fill("");
			assert.equal(await height(), 100, "手动清空后折回");
			await editor.fill("Wrapped words ".repeat(500));
			assert.ok(await height() > 100, "没有显式换行的长文本也随折行增高");
			await editor.fill("");
		}
		await page.close();
	}
	console.log("PASS 默认 100px、随行增高、500px 上限、程序/手动清空复位；CSS 缺失或返回 HTML 时回退官方样式");

	page = await fixture("?stylesheet=" + encodeURIComponent(customStylesheet), (page) => page.addInitScript(() => {
		const original = window.fetch;
		window.fetch = (input, options) => String(input).endsWith("/giscus.css") ? new Promise((_, reject) => {
			window.testAssetStarted = true;
			options.signal.addEventListener("abort", () => { window.testAssetAborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
		}) : original(input, options);
	}));
	await page.evaluate(() => scrollTo(0, 3500));
	await page.waitForFunction(() => window.testAssetStarted);
	await page.evaluate(() => window.removeComments());
	await page.waitForFunction(() => window.testAssetAborted);
	assert.equal(await widgetCount(page), 0);
	await page.close();
	console.log("PASS 离开页面会取消尚未完成的增强 CSS 请求");
	page = await fixture("", (page) => page.addInitScript(() => {
		Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
	}));
	await page.evaluate(() => scrollTo(0, 3500));
	await page.getByText("暂时无法连接评论服务。").waitFor();
	assert.equal(await widgetCount(page), 0);
	await page.close();
	console.log("PASS 浏览器禁用本地存储时显示回退入口，不产生未捕获异常");
	page = await fixture("", (page) => page.route(/\/giscus\.js(?:\?|$)/, (route) => route.abort()));
	await page.evaluate(() => scrollTo(0, 3500));
	await page.getByText("评论组件加载失败，请刷新页面后重试。").waitFor();
	assert.equal(await page.getByRole("button", { name: "刷新页面" }).count(), 1);
	assert.equal(await widgetCount(page), 0);
	await page.close();
	console.log("PASS 模块请求失败时提供整页刷新入口，避免重复命中失败的模块缓存");
	assert.deepEqual(errors, [], "浏览器没有未捕获异常");
} finally { await browser.close(); }
