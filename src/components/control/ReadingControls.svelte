<script lang="ts">
import { onMount } from "svelte";
import { frontendConfig, siteConfig, musicPlayerConfig } from "@/config";
import { DARK_MODE, LIGHT_MODE } from "@constants/constants";
import {
	getReadingFontSize,
	getCurrentTheme,
	normalizeReadingFontSize,
	setReadingFontSize,
	setTheme,
} from "@utils/setting-utils";
import { onPageView } from "@utils/page-view";
import CollapsibleTOC from "../CollapsibleTOC.svelte";

let { initialArticle = false }: { initialArticle?: boolean } = $props();
const reading = frontendConfig.reading;
const bottomSpace = musicPlayerConfig.enable ? 104 : 24;
let isArticle = $state(initialArticle);
let hasComments = $state(false);
let ready = $state(false);
let fontSize = $state(reading.defaultFontSize);
let isDark = $state(false);
let fontOpen = $state(false);
let leftOpen = $state(!reading.collapseLeftSidebar);
let tocMode = $state<"panel" | "float">(reading.defaultTocMode);
let tocOpen = $state<boolean | null>(null);
let isDesktop = $state(false);
let leftManaged = $state(false);
let tocOutside = $state(false);
let tocLeft = $state(0);
const tocVisible = $derived(isDesktop && siteConfig.toc.enable && tocMode === "panel" &&
	(tocOpen ?? (tocOutside || reading.defaultTocOpen)));
let tocTop = $state(88);
let readingProgress = $state(0);
let tools: HTMLElement;
let fontButton: HTMLButtonElement;

function changeFont(value: number) {
	fontSize = normalizeReadingFontSize(value);
	setReadingFontSize(fontSize);
}
function toggleTheme(event: MouseEvent) {
	setTheme(getCurrentTheme() === DARK_MODE ? LIGHT_MODE : DARK_MODE, event);
}
function syncLayout() {
	const root = document.documentElement;
	root.dataset.readerArticle = String(isArticle);
	root.dataset.readerLeft = leftOpen ? "open" : "collapsed";
	root.dataset.readerLeftManaged = String(leftManaged);
	root.dataset.readerLeftLayout = reading.balanceArticleWithSidebar ? "balanced" : "grid";
	root.dataset.readerTocMode = siteConfig.toc.enable ? tocMode : "float";
	root.dataset.readerTocOpen = String(tocVisible);
	root.dataset.readerTocPlacement = tocOutside ? "outside" : "column";
	const sidebar = document.getElementById("sidebar");
	if (sidebar) sidebar.inert = isArticle && !leftOpen && leftManaged;
}
function toggleLeft() {
	leftOpen = !leftOpen;
	updatePosition();
}
function changeTocMode(mode: "panel" | "float") {
	tocMode = mode;
	fontOpen = false;
	tocOpen = mode === "panel" ? true : null;
	try {
		localStorage.setItem("reader-toc-mode", mode);
	} catch {}
	updatePosition();
	document.dispatchEvent(new CustomEvent("reader:toc-mode"));
}
function toggleToc() {
	if (tocMode === "float") changeTocMode("panel");
	else {
		tocOpen = !tocVisible;
		fontOpen = false;
		updatePosition();
	}
}
function closeToc() {
	tocOpen = false;
	updatePosition();
	if (document.getElementById("reader-toc-panel")?.contains(document.activeElement))
		document.getElementById("reader-toc-toggle")?.focus();
}
function updatePosition() {
	if (!isArticle) return;
	isDesktop = window.innerWidth >= 1024;
	// Browser zoom can make a mouse-driven desktop narrower than the tablet breakpoint.
	leftManaged = window.matchMedia("(min-width: 1024px), (hover: hover) and (pointer: fine)").matches;
	// At high desktop zoom there is no room for a second column; keep reading full width.
	if (leftManaged && !isDesktop) leftOpen = false;
	const grid = document.getElementById("main-grid");
	if (grid) {
		// Measure the full reading frame, independent of the current article width.
		// This avoids switching back and forth when opening a directory narrows the article.
		const frame = grid.getBoundingClientRect();
		const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
		const frameLeft = frame.left + rem;
		const frameRight = frame.right - rem;
		const toolbarLeft = window.innerWidth - 12 - reading.sidebarWidth;
		tocLeft = toolbarLeft - reading.tocGap - reading.tocWidth;
		const reservedWidth = Math.max(0, frameRight - tocLeft + reading.tocGap);
		tocOutside = reading.autoOutsideToc && reservedWidth === 0;
		// Reuse the outer margin first; only reserve the part that would overlap the article.
		document.documentElement.style.setProperty("--reading-toc-reserved-width", `${reservedWidth}px`);
		let articleLeft = frameLeft;
		const articleRight = tocVisible ? Math.min(frameRight, tocLeft - reading.tocGap) : frameRight;
		if (reading.balanceArticleWithSidebar && leftOpen && isDesktop) {
			const sidebarWidth = 17.5 * rem;
			// Like the directory, use the outer space first and reserve only the overlapping side.
			articleLeft = Math.max(frameLeft, reading.leftSidebarEdge + sidebarWidth + reading.tocGap);
			document.documentElement.style.setProperty("--reading-left-sidebar-position", `${articleLeft - reading.tocGap - sidebarWidth - frame.left}px`);
		}
		document.documentElement.style.setProperty("--reading-article-left-inset", `${articleLeft - frame.left}px`);
		document.documentElement.style.setProperty("--reading-article-right-inset", `${frame.right - articleRight}px`);
	}
	const top = document.getElementById("post-container")?.getBoundingClientRect().top || 0;
	tocTop = Math.max(88, Math.min(top, window.innerHeight - 200));
	syncLayout();
}

onMount(() => {
	ready = true;
	fontSize = getReadingFontSize();
	const stored = document.documentElement.dataset.readerTocMode;
	if (stored === "panel" || stored === "float") tocMode = stored;
	const refresh = () => {
		isArticle = !!document.getElementById("post-container");
		hasComments = !!document.getElementById("article-comments");
		leftOpen = !reading.collapseLeftSidebar;
		fontOpen = false;
		tocOpen = null;
		readingProgress = 0;
		syncLayout();
		requestAnimationFrame(updatePosition);
	};
	const syncTheme = () => {
		isDark = document.documentElement.classList.contains("dark");
	};
	syncTheme();
	const observer = new MutationObserver(syncTheme);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	const clickOutside = (event: MouseEvent) => {
		if (!tools?.contains(event.target as Node)) fontOpen = false;
	};
	const escape = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			if (fontOpen) {
				fontOpen = false;
				fontButton?.focus();
			}
			closeToc();
		}
	};
	const resize = () => {
		syncLayout();
		updatePosition();
	};
	const syncProgress = (event: Event) => {
		readingProgress = (event as CustomEvent<{ progress: number }>).detail.progress;
	};
	refresh();
	const layoutObserver = new ResizeObserver(updatePosition);
	const observeLayout = () => {
		layoutObserver.disconnect();
		for (const id of ["navbar", "main-grid"]) {
			const element = document.getElementById(id);
			if (element) layoutObserver.observe(element);
		}
	};
	observeLayout();
	const unsubscribe = onPageView(() => { refresh(); observeLayout(); });
	document.addEventListener("click", clickOutside);
	document.addEventListener("keydown", escape);
	document.addEventListener("toc:progress", syncProgress);
	window.addEventListener("resize", resize);
	const leftMedia = window.matchMedia("(min-width: 1024px), (hover: hover) and (pointer: fine)");
	leftMedia.addEventListener("change", resize);
	window.addEventListener("scroll", updatePosition, { passive: true });
	return () => {
		observer.disconnect();
		layoutObserver.disconnect();
		unsubscribe();
		document.removeEventListener("click", clickOutside);
		document.removeEventListener("keydown", escape);
		document.removeEventListener("toc:progress", syncProgress);
		window.removeEventListener("resize", resize);
		leftMedia.removeEventListener("change", resize);
		window.removeEventListener("scroll", updatePosition);
	};
});
</script>

{#if isArticle && ready}
    {#if leftManaged && isDesktop}
        <button id="reader-sidebar-toggle" class="reader-sidebar-toggle" title={leftOpen ? '收起左侧栏' : '展开左侧栏'} aria-label={leftOpen ? '收起左侧栏' : '展开左侧栏'} aria-controls="sidebar" aria-expanded={leftOpen} onclick={toggleLeft}>
            <svg class:expanded={leftOpen} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
        </button>
    {/if}
    <aside id="reading-controls" class="reader-toolbar" aria-label="文章阅读工具" data-pagefind-ignore bind:this={tools}>
        <button bind:this={fontButton} class="tool-button font-trigger" title="调整阅读字号" aria-label="调整阅读字号" aria-controls="reader-font-panel" aria-expanded={fontOpen} onclick={() => fontOpen = !fontOpen}>Aa</button>
        <button class="tool-button" title={isDark ? '切换到浅色模式' : '切换到深色模式'} aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'} onclick={toggleTheme}>
            {#if isDark}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
            {:else}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z" /></svg>
            {/if}
        </button>
        {#if siteConfig.toc.enable}
            <button id="reader-toc-toggle" class="tool-button toc-trigger" title={tocMode === 'float' ? '切回固定目录' : tocVisible ? '收起文章目录' : '展开文章目录'} aria-label={tocMode === 'float' ? '切回固定目录' : tocVisible ? '收起文章目录' : '展开文章目录'} aria-controls="reader-toc-panel" aria-expanded={tocVisible} onclick={toggleToc}>
                {#if reading.tocProgressRing}
                    <svg class="toc-progress-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" pathLength="100" fill="none" style:stroke-dashoffset={100 * (1 - readingProgress)} /></svg>
                {/if}
                <svg class="toc-button-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" /></svg>
            </button>
        {/if}
        {#if hasComments}
            <a id="reader-comment-link" class="tool-button" href="#article-comments" title="跳转到评论区" aria-label="跳转到评论区" data-no-swup onclick={() => { fontOpen = false; }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg>
            </a>
        {/if}
        {#if fontOpen}
            <div id="reader-font-panel" class="reader-popover" role="group" aria-label="阅读字号设置">
                <div class="font-heading"><label for="reading-font-slider">阅读字号</label><output for="reading-font-slider">{fontSize} px</output></div>
                <input id="reading-font-slider" aria-label="阅读字号" type="range" min={reading.minFontSize} max={reading.maxFontSize} step={reading.step} value={fontSize} oninput={event => changeFont(Number(event.currentTarget.value))} />
                <div class="font-actions">
                    <button aria-label="减小字号" disabled={fontSize <= reading.minFontSize} onclick={() => changeFont(fontSize - reading.step)}>A−</button>
                    <button aria-label="恢复默认阅读字号" disabled={fontSize === reading.defaultFontSize} onclick={() => changeFont(reading.defaultFontSize)}>恢复默认</button>
                    <button aria-label="增大字号" disabled={fontSize >= reading.maxFontSize} onclick={() => changeFont(fontSize + reading.step)}>A+</button>
                </div>
            </div>
        {/if}
    </aside>
    {#if siteConfig.toc.enable && tocMode === 'panel'}
        <aside id="reader-toc-panel" class="reader-toc-panel" class:toc-open={tocVisible} aria-label="文章目录" aria-hidden={!tocVisible} inert={!tocVisible} data-pagefind-ignore style:left={tocLeft + 'px'} style:top={tocTop + 'px'} style:max-height={'calc(100dvh - ' + (tocTop + bottomSpace) + 'px)'}>
            <div class="toc-heading"><span>文章目录</span><div class="toc-heading-actions"><button class="toc-mode-button" title="改用小球目录" aria-label="改用小球目录" onclick={() => changeTocMode('float')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M9 9h6M9 12h6M9 15h6" /></svg></button><button class="toc-mode-button" title="收起文章目录" aria-label="收起文章目录" onclick={closeToc}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></div>
            <div class="reader-toc-body" data-toc-scroll><CollapsibleTOC followActive={tocVisible} showProgress={true} bind:readingProgress /></div>
        </aside>
    {/if}
{/if}

<style>
.reader-toolbar, .reader-sidebar-toggle, .reader-toc-panel { display: none; }
/* Left-sidebar controls follow the actual sidebar layout and desktop input capability. */
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-managed="true"][data-reader-left="collapsed"] #sidebar) { display: none !important; }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-managed="true"][data-reader-left="collapsed"] #main-grid) {
        grid-template-columns: minmax(0, 1fr) !important;
    }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-managed="true"][data-reader-left="collapsed"] #swup-container) {
        grid-column: 1 / -1 !important;
        min-width: 0;
    }
    .reader-sidebar-toggle { display: flex; align-items: center; justify-content: center; position: fixed; left: 6px; top: 50%; width: 26px; height: 44px; z-index: 45; border-radius: 7px; background: var(--card-bg); color: var(--content-meta); }
    .reader-sidebar-toggle:hover { color: var(--primary); background: var(--btn-plain-bg-hover); }
    .reader-sidebar-toggle svg.expanded { transform: rotate(180deg); }
@media (min-width: 1024px) {
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-layout="grid"][data-reader-toc-mode="panel"][data-reader-toc-open="true"][data-reader-toc-placement="column"] #main-grid) {
        padding-inline-end: calc(1rem + var(--reading-toc-reserved-width, 0px));
    }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-layout="balanced"] #main-grid) {
        position: relative;
        grid-template-columns: minmax(0, 1fr) !important;
        padding-inline-start: var(--reading-article-left-inset, 1rem);
        padding-inline-end: var(--reading-article-right-inset, 1rem);
    }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-layout="balanced"] #swup-container) {
        grid-column: 1 / -1 !important;
        min-width: 0;
    }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-left-layout="balanced"][data-reader-left="open"] #sidebar) {
        position: absolute;
        grid-area: auto !important;
        inset-block: 0;
        left: var(--reading-left-sidebar-position, 0px);
        width: 17.5rem;
    }
    :global(:root[data-reader-article="true"][data-reading-sidebar="true"][data-reader-toc-mode="panel"] .floating-toc-wrapper) { display: none !important; }
    .reader-toolbar {
        display: flex; flex-direction: column; gap: 6px; position: fixed;
        right: 12px; top: 50%; transform: translateY(-50%); z-index: 45;
        width: var(--reading-sidebar-width, 40px); color: var(--content-meta);
    }
    .tool-button { display: flex; align-items: center; justify-content: center; width: 100%; height: 38px; border-radius: 8px; background: var(--card-bg); }
    .tool-button:hover, .tool-button[aria-expanded="true"] { color: var(--primary); background: var(--btn-plain-bg-hover); }
    .toc-trigger { position: relative; }
    .toc-button-icon { position: relative; z-index: 1; }
    .toc-progress-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); pointer-events: none; }
    .toc-progress-ring circle { stroke: var(--primary); stroke-width: 5; stroke-dasharray: 100; stroke-linecap: round; transition: stroke-dashoffset 0.1s linear; }
    .font-trigger { font-family: system-ui, sans-serif; font-size: 17px; }
    .reader-popover { position: absolute; right: calc(100% + 10px); top: 0; width: 216px; padding: 16px; background: var(--float-panel-bg); border: 1px solid var(--line-divider); border-radius: 12px; box-shadow: 0 5px 24px rgb(0 0 0 / 8%); font-size: 14px; color: var(--content-meta); }
    .font-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    .font-heading output { color: var(--primary); font-weight: 600; }
    input { width: 100%; accent-color: var(--primary); }
    .font-actions { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 12px; }
    .font-actions button { padding: 6px 9px; border-radius: 6px; background: var(--btn-regular-bg); color: var(--btn-content); font-size: 12px; }
    button:disabled { opacity: 0.4; cursor: default; }
    button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
    .toc-heading { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; padding: 12px 14px 8px; color: var(--content-meta); font-size: 14px; font-weight: 600; }
    .toc-heading-actions { display: flex; gap: 2px; }
    .toc-mode-button { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; color: var(--content-meta); }
    .toc-mode-button:hover { color: var(--primary); background: var(--btn-plain-bg-hover); }
    .reader-toc-panel { position: fixed; width: var(--reading-toc-width, 260px); background: var(--card-bg); border: 1px solid var(--line-divider); border-radius: 12px; z-index: 40; flex-direction: column; }
    .reader-toc-panel.toc-open { display: flex; }
    .reader-toc-body { min-height: 0; padding: 0 10px 12px; overflow-y: auto; overscroll-behavior: contain; }
    :global(.reader-toc-panel .toc-row a) { font-size: 13px; }
}
@media (prefers-reduced-motion: reduce) {
    .toc-progress-ring circle { transition: none; }
}
</style>
