<script lang="ts">
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { navigateToPage } from "@utils/navigation-utils";
import {
	deduplicateSearchResults,
	escapeSearchHtml as escapeHtml,
	findSearchArticle,
	highlightSearchText,
	matchesSearchText,
	matchingSearchExcerpt,
	type SearchArticle,
} from "@utils/search-utils";
import { onMount, onDestroy, tick } from "svelte";
import type { SearchResult } from "@/global";
import { frontendConfig } from "@/config";

let { articles = [] }: { articles?: SearchArticle[] } = $props();

let keywordDesktop = $state("");
let keywordMobile = $state("");
let activeDesktopSearch = $state(true);
type DisplayResult = SearchResult & {
	titleHtml: string;
	excerptHtml: string;
	matchedTags: { text: string; html: string }[];
};
let result: DisplayResult[] = $state([]);
let caseSensitive = $state(false);
let searchStatus = $state<"idle" | "loading" | "ready" | "error">("idle");
let searchVersion = 0;
let pagefindLoaded = $state(false);
let initialized = $state(false);
let isDesktopSearchExpanded = $state(false);
let debounceTimer: NodeJS.Timeout;
let windowJustFocused = false;
let focusTimer: NodeJS.Timeout;
let blurTimer: NodeJS.Timeout;

function parseExcerpt(value: string): HTMLElement {
	return new DOMParser().parseFromString(value, "text/html").body;
}

function renderExcerpt(value: string, keyword: string, matchCase: boolean): string {
	if (!frontendConfig.search.highlightMatches) return value;
	const body = parseExcerpt(value);
	const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
	let html = "";
	while (walker.nextNode()) {
		const node = walker.currentNode;
		const text = node.textContent || "";
		// Keep Pagefind's stemmed-word highlighting in the normal search mode.
		html += !matchCase && node.parentElement?.closest("mark")
			? `<mark class="search-match">${escapeHtml(text)}</mark>`
			: highlightSearchText(text, keyword, matchCase);
	}
	return html;
}

function resultText(item: SearchResult): string {
	const article = findSearchArticle(item.url, articles);
	return [item.content || "", item.meta.title, article?.title || "",
		article?.description || "", ...(article?.tags || []), parseExcerpt(item.excerpt).textContent || ""].join(" ");
}

function prepareResult(item: SearchResult, keyword: string, matchCase: boolean): DisplayResult {
	const article = findSearchArticle(item.url, articles);
	let excerptHtml = renderExcerpt(item.excerpt, keyword, matchCase);
	if (frontendConfig.search.highlightMatches && matchCase && item.content &&
		!excerptHtml.includes('<mark class="search-match">')) {
		// The default Pagefind excerpt can center on a differently cased occurrence.
		const snippet = matchingSearchExcerpt(item.content, keyword, true);
		if (snippet) excerptHtml = highlightSearchText(snippet, keyword, true);
	}
	return {
		...item,
		titleHtml: frontendConfig.search.highlightMatches
			? highlightSearchText(item.meta.title, keyword, matchCase) : escapeHtml(item.meta.title),
		excerptHtml,
		matchedTags: frontendConfig.search.highlightMatches
			? (article?.tags || []).map(text => ({ text, html: highlightSearchText(text, keyword, matchCase) }))
				.filter(tag => tag.html.includes('<mark class="search-match">'))
			: [],
	};
}

const togglePanel = () => {
	activeDesktopSearch = false;
	const panel = document.getElementById("search-panel");
	panel?.classList.toggle("float-panel-closed");
	if (panel && !panel.classList.contains("float-panel-closed")) {
		panel.inert = false;
		panel.querySelector<HTMLInputElement>("input:not([type=checkbox])")?.focus();
	}
};

const openDesktopSearch = async (fromHover = false) => {
	// 如果窗口刚获得焦点，不自动展开搜索框
	if (fromHover && windowJustFocused) {
		return;
	}
	isDesktopSearchExpanded = true;
	await tick();
	if (isDesktopSearchExpanded) document.getElementById("search-input-desktop")?.focus();
};

const collapseDesktopSearch = () => {
	if (!keywordDesktop) {
		isDesktopSearchExpanded = false;
	}
};

const handleBlur = (event: FocusEvent) => {
	const container = document.getElementById("search-container");
	if (event.relatedTarget instanceof Node && container?.contains(event.relatedTarget)) return;
	// 延迟处理以允许搜索结果的点击事件先于折叠逻辑执行
	blurTimer = setTimeout(() => {
		if (container?.contains(document.activeElement)) return;
		isDesktopSearchExpanded = false;
		// 仅隐藏面板并折叠，保留搜索关键词和结果以便下次展开时查看
		setPanelVisibility(false, true);
	}, 200);
};

const setPanelVisibility = (show: boolean, isDesktop: boolean): void => {
	const panel = document.getElementById("search-panel");
	if (!panel || !isDesktop) return;
	if (show) {
		panel.classList.remove("float-panel-closed");
	} else {
		panel.classList.add("float-panel-closed");
	}
};

const closeSearchPanel = (): void => {
	clearTimeout(blurTimer);
	clearTimeout(debounceTimer);
	isDesktopSearchExpanded = false;
	const panel = document.getElementById("search-panel");
	if (panel) {
		panel.classList.add("float-panel-closed");
	}
	// 清空搜索关键词和结果
	keywordDesktop = "";
	keywordMobile = "";
	result = [];
	searchStatus = "idle";
	searchVersion++;
};

const handleResultClick = (event: Event, url: string): void => {
	event.preventDefault();
	closeSearchPanel();
	navigateToPage(url);
};

const search = async (keyword: string, isDesktop: boolean, matchCase = caseSensitive): Promise<void> => {
	const version = ++searchVersion;
	matchCase = frontendConfig.search.matchCaseOption && matchCase;
	keyword = keyword.trim();
	if (!keyword) {
		setPanelVisibility(false, isDesktop);
		result = [];
		searchStatus = "idle";
		return;
	}
	if (!initialized) {
		return;
	}
	searchStatus = "loading";
	result = [];
	setPanelVisibility(true, isDesktop);
	try {
		let searchResults: SearchResult[] = [];
		if (pagefindLoaded && window.pagefind) {
			const response = await window.pagefind.search(keyword);
			searchResults = await Promise.all(response.results.map((item) => item.data()));
		} else if (import.meta.env.DEV) {
			// 开发预览搜索真实标题、简介与标签，正式环境仍使用 Pagefind 全文索引。
			searchResults = articles
				.filter(article => matchesSearchText(
					`${article.title || ""} ${article.description || ""} ${(article.tags || []).join(" ")}`,
					keyword, matchCase))
				.map((article) => ({
					url: article.url,
					meta: { title: article.title || "" },
					excerpt: escapeHtml(article.description || ""),
				}));
		} else {
			throw new Error("Pagefind is not available.");
		}
		if (version !== searchVersion) return;
		if (matchCase) searchResults = searchResults.filter(item => matchesSearchText(resultText(item), keyword, true));
		const uniqueResults = frontendConfig.search.deduplicate
			? deduplicateSearchResults(searchResults, articles)
			: searchResults;
		result = uniqueResults.map(item => prepareResult(item, keyword, matchCase));
		searchStatus = "ready";
		setPanelVisibility(true, isDesktop);
	} catch (error) {
		if (version !== searchVersion) return;
		console.error("Search error:", error);
		result = [];
		searchStatus = "error";
		setPanelVisibility(true, isDesktop);
	}
};

onMount(() => {
	activeDesktopSearch = window.innerWidth >= 1024;
	// Global panel handlers also toggle this class; keep every opening/closing path accessible.
	const panel = document.getElementById("search-panel");
	const syncPanelAccessibility = () => {
		if (panel) panel.inert = panel.classList.contains("float-panel-closed");
	};
	const panelObserver = new MutationObserver(syncPanelAccessibility);
	if (panel) panelObserver.observe(panel, { attributes: true, attributeFilter: ["class"] });
	syncPanelAccessibility();
	const initializeSearch = () => {
		initialized = true;
		pagefindLoaded =
			typeof window !== "undefined" &&
			!!window.pagefind &&
			typeof window.pagefind.search === "function";
		console.log("Pagefind status on init:", pagefindLoaded);
	};

	const handleReady = () => initializeSearch();
	const handleLoadError = () => initializeSearch();
	document.addEventListener("pagefindready", handleReady);
	document.addEventListener("pagefindloaderror", handleLoadError);
	let initializeTimer: ReturnType<typeof setTimeout> | undefined;
	if (import.meta.env.DEV || window.pagefind?.search) {
		initializeSearch();
	} else {
		initializeTimer = setTimeout(initializeSearch, 2000);
	}

	// 监听窗口焦点事件，防止切换窗口时自动展开搜索框
	const handleFocus = () => {
		windowJustFocused = true;
		clearTimeout(focusTimer);
		focusTimer = setTimeout(() => {
			windowJustFocused = false;
		}, 500); // 500ms 后才允许 mouseenter 触发展开
	};

	window.addEventListener("focus", handleFocus);
	const handleEscape = (event: KeyboardEvent) => {
		if (event.key !== "Escape" || !document.getElementById("search-container")?.contains(document.activeElement)) return;
		event.preventDefault();
		const trigger = document.getElementById(activeDesktopSearch ? "search-toggle" : "search-switch");
		closeSearchPanel();
		trigger?.focus();
	};
	document.addEventListener("keydown", handleEscape);

	return () => {
		document.removeEventListener("keydown", handleEscape);
		panelObserver.disconnect();
		window.removeEventListener("focus", handleFocus);
		document.removeEventListener("pagefindready", handleReady);
		document.removeEventListener("pagefindloaderror", handleLoadError);
		clearTimeout(initializeTimer);
	};
});

$effect(() => {
	if (pagefindLoaded || initialized) {
		const keyword = activeDesktopSearch ? keywordDesktop : keywordMobile;
		const isDesktop = activeDesktopSearch;
		const matchCase = caseSensitive;

		clearTimeout(debounceTimer);
		searchVersion++;
		if (keyword) {
			debounceTimer = setTimeout(() => {
				search(keyword, isDesktop, matchCase);
			}, 300);
		} else {
			result = [];
			searchStatus = "idle";
			setPanelVisibility(false, isDesktop);
		}
	}
});

$effect(() => {
	if (typeof document !== "undefined") {
		const navbar = document.getElementById("navbar");
		if (isDesktopSearchExpanded) {
			navbar?.classList.add("is-searching");
		} else {
			navbar?.classList.remove("is-searching");
		}
	}
});

onDestroy(() => {
	if (typeof document !== "undefined") {
		const navbar = document.getElementById("navbar");
		navbar?.classList.remove("is-searching");
	}
	clearTimeout(debounceTimer);
	clearTimeout(focusTimer);
	clearTimeout(blurTimer);
	searchVersion++;
});
</script>

<!-- search bar for desktop view (collapsed by default) -->
<div class="hidden lg:block relative w-11 h-11 shrink-0">
    <div
        id="search-bar"
        class="flex transition-all items-center h-11 rounded-lg absolute right-0 top-0 shrink-0
            {isDesktopSearchExpanded ? 'bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06] dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10' : 'btn-plain active:scale-90'}
            {isDesktopSearchExpanded ? 'w-48' : 'w-11'}"
        role="group"
        aria-label="文章搜索"
        onmouseenter={() => {if (!isDesktopSearchExpanded) openDesktopSearch(true)}}
        onmouseleave={collapseDesktopSearch}
    >
        <button id="search-toggle" type="button" aria-label="搜索文章" aria-expanded={isDesktopSearchExpanded}
            aria-controls="search-panel" onclick={() => openDesktopSearch()}
            class="absolute left-0 top-0 z-10 w-11 h-11 rounded-lg flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
            <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
        </button>
        <input id="search-input-desktop" placeholder={i18n(I18nKey.search)} bind:value={keywordDesktop}
            aria-label="搜索文章关键词" tabindex={isDesktopSearchExpanded ? 0 : -1}
            onfocus={() => {
				activeDesktopSearch = true;
                clearTimeout(blurTimer);
                isDesktopSearchExpanded = true;
                search(keywordDesktop, true);
            }}
            onblur={handleBlur}
            class="transition-all pl-10 text-sm bg-transparent outline-0
                h-full {isDesktopSearchExpanded ? 'w-36' : 'w-0'} text-black/50 dark:text-white/50"
        >
    </div>
</div>

<!-- toggle btn for phone/tablet view -->
<button onclick={togglePanel} aria-label="Search Panel" id="search-switch"
        class="btn-plain scale-animation lg:!hidden rounded-lg w-11 h-11 active:scale-90">
    <Icon icon="material-symbols:search" class="text-[1.25rem]"></Icon>
</button>

<!-- search panel -->
<div id="search-panel" inert class="float-panel float-panel-closed absolute md:w-[30rem] top-20 left-4 md:left-[unset] right-4 z-50 search-panel shadow-2xl rounded-2xl p-2">
    <!-- search bar inside panel for phone/tablet -->
    <div id="search-bar-inside" class="flex relative lg:hidden transition-all items-center h-11 rounded-xl
      bg-black/[0.04] hover:bg-black/[0.06] focus-within:bg-black/[0.06]
      dark:bg-white/5 dark:hover:bg-white/10 dark:focus-within:bg-white/10
  ">
        <Icon icon="material-symbols:search" class="absolute text-[1.25rem] pointer-events-none ml-3 transition my-auto text-black/30 dark:text-white/30"></Icon>
        <input placeholder={i18n(I18nKey.search)} bind:value={keywordMobile}
               onfocus={() => { activeDesktopSearch = false; clearTimeout(blurTimer); }} onblur={handleBlur}
               class="pl-10 absolute inset-0 text-sm bg-transparent outline-0
               focus:w-60 text-black/50 dark:text-white/50"
        >
    </div>
    {#if frontendConfig.search.matchCaseOption}
        <div class="search-options">
            <label class="search-match-case"><input type="checkbox" bind:checked={caseSensitive}
                onfocus={() => clearTimeout(blurTimer)} onblur={handleBlur} />匹配大小写</label>
        </div>
    {/if}
    <!-- search results -->
    {#if import.meta.env.DEV && !pagefindLoaded && searchStatus !== 'idle'}
        <p class="px-3 pt-2 text-xs text-50">开发预览仅搜索标题、简介与标签。</p>
    {/if}
    <div aria-live="polite">
        {#if searchStatus === 'loading'}
            <p class="px-3 py-4 text-sm text-50">正在搜索…</p>
        {:else if searchStatus === 'error'}
            <p class="px-3 py-4 text-sm text-50">搜索暂时不可用，请稍后重试。</p>
        {:else if searchStatus === 'ready' && result.length === 0}
            <p class="px-3 py-4 text-sm text-50">没有找到相关文章，试试其他关键词。</p>
        {/if}
    </div>
    {#each result as item}
        <a href={item.url}
           onclick={(e) => handleResultClick(e, item.url)}
           onblur={handleBlur}
           class="transition first-of-type:mt-2 lg:first-of-type:mt-0 group block
       rounded-xl text-lg px-3 py-2 hover:bg-[var(--btn-plain-bg-hover)] active:bg-[var(--btn-plain-bg-active)]">
            <div class="transition text-90 inline-flex font-bold group-hover:text-[var(--primary)]">
                <span class="search-title">{@html item.titleHtml}</span><Icon icon="fa7-solid:chevron-right" class="transition text-[0.75rem] translate-x-1 my-auto text-[var(--primary)]"></Icon>
            </div>
            <div class="transition text-sm text-50">
                {@html item.excerptHtml}
            </div>
            {#if item.matchedTags.length > 0}
                <div class="search-tags" aria-label="匹配的标签">
                    {#each item.matchedTags as tag}<span>#{@html tag.html}</span>{/each}
                </div>
            {/if}
        </a>
    {/each}
</div>

<style>
    input:not([type="checkbox"]):focus {
        outline: 0;
    }
    :global(.search-panel) {
        max-height: calc(100vh - 100px);
        overflow-y: auto;
    }
    .search-options { display: flex; justify-content: flex-end; padding: 6px 8px; margin-bottom: 4px; border-bottom: 1px solid var(--line-divider); }
    .search-title { min-width: 0; overflow-wrap: anywhere; }
</style>
