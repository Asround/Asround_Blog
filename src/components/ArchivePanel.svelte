<script lang="ts">
import { onMount } from "svelte";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { frontendConfig } from "../config";
import { getCategoryLabel } from "../utils/category-utils";
import { escapeSearchHtml, highlightSearchText, matchesSearchText, matchingSearchExcerpt } from "../utils/search-utils";

export let tags: string[] = [];
export let categories: string[] = [];
export let sortedPosts: Post[] = [];

interface Post {
	id: string;
	url?: string;
	data: {
		title: string;
		tags: string[];
		category?: string;
		published: Date;
		description?: string;
	};
}
interface Group {
	year: number;
	posts: Post[];
}
let selectedTags: string[] = [];
let selectedCategories: string[] = [];
let uncategorized = false;
let keyword = "";
let caseSensitive = false;
let ready = false;

function readFilters() {
	const params = new URLSearchParams(window.location.search);
	selectedTags = params.getAll("tag");
	selectedCategories = params.getAll("category");
	uncategorized = params.get("uncategorized") === "true";
	keyword = params.get("q") || "";
	caseSensitive = frontendConfig.search.matchCaseOption && params.get("matchCase") === "true";
	ready = true;
}
function updateUrl() {
	const next = new URL(window.location.href);
	for (const key of ["tag", "category", "uncategorized", "q", "matchCase"]) next.searchParams.delete(key);
	selectedTags.forEach((tag) => next.searchParams.append("tag", tag));
	selectedCategories.forEach((category) => next.searchParams.append("category", category));
	if (uncategorized) next.searchParams.set("uncategorized", "true");
	if (keyword.trim()) next.searchParams.set("q", keyword.trim());
	if (caseSensitive) next.searchParams.set("matchCase", "true");
	// Swup restores history entries from state.url, so keep it in sync with the address bar.
	const state = window.history.state;
	const nextState = state?.source === "swup"
		? { ...state, url: next.pathname + next.search + next.hash } : state;
	window.history.replaceState(nextState, "", next);
}
function clearFilters() {
	selectedTags = [];
	selectedCategories = [];
	uncategorized = false;
	keyword = "";
	caseSensitive = false;
	updateUrl();
}
function selectCategory(value: string) {
	uncategorized = value === "__uncategorized";
	selectedCategories = value && !uncategorized ? [value] : [];
	updateUrl();
}
function groupPosts(posts: Post[]): Group[] {
	const years = new Map<number, Post[]>();
	for (const post of posts) {
		const year = new Date(post.data.published).getFullYear();
		years.set(year, [...(years.get(year) || []), post]);
	}
	return [...years].map(([year, posts]) => ({ year, posts })).sort((a, b) => b.year - a.year);
}
$: filteredPosts = sortedPosts
	.filter(
		(post) =>
			(!selectedTags.length || post.data.tags.some((tag) => selectedTags.includes(tag))) &&
			(!selectedCategories.length || selectedCategories.includes(post.data.category || "")) &&
			(!uncategorized || !post.data.category) &&
			matchesSearchText(
				[post.data.title, post.data.description || "", ...post.data.tags].join(" "),
				keyword, caseSensitive),
	)
	.slice()
	.sort((a, b) => new Date(b.data.published).getTime() - new Date(a.data.published).getTime());
$: groups = groupPosts(filteredPosts);
$: categoryPosts = sortedPosts.filter(post =>
	(!selectedCategories.length || selectedCategories.includes(post.data.category || "")) &&
	(!uncategorized || !post.data.category));
$: availableTags = selectedCategories.length || uncategorized
	? tags.filter(tag => categoryPosts.some(post => post.data.tags.includes(tag)))
	: tags;
$: tagsOutsideCategory = selectedTags.filter(tag => !availableTags.includes(tag));
$: hasFilters =
	selectedTags.length > 0 || selectedCategories.length > 0 || uncategorized || !!keyword.trim() || caseSensitive;
$: isResources =
	frontendConfig.resourceEntry.enable &&
	selectedCategories.length === 1 &&
	selectedCategories[0] === frontendConfig.resourceEntry.category;
function formatDate(value: Date) {
	const date = new Date(value);
	return (
		String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
	);
}
function formatTag(tagList: string[]) {
	return tagList.map((tag) => "#" + tag).join(" ");
}
function renderSearchText(text: string, query: string, matchCase: boolean) {
	return frontendConfig.search.highlightMatches
		? highlightSearchText(text, query, matchCase) : escapeSearchHtml(text);
}
onMount(() => {
	readFilters();
	window.addEventListener("popstate", readFilters);
	return () => window.removeEventListener("popstate", readFilters);
});
</script>

<div class="card-base px-8 py-6">
    {#if frontendConfig.archiveFilters}
        <div class="archive-filters mb-6 pb-5 border-b border-[var(--line-divider)]">
            <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                    <h1 class="text-2xl font-bold text-90">{isResources ? frontendConfig.resourceEntry.label : "文章归档"}</h1>
                    <p class="text-sm text-50 mt-2">{isResources ? "课程笔记、学习资料与下载入口，按发布时间整理。" : "按分类、标签或关键词查找文章。"}</p>
                </div>
                <span class="text-sm text-50 shrink-0 pt-1" aria-live="polite">{filteredPosts.length} 篇文章</span>
            </div>
            <div class="archive-filter-grid">
                <label class="text-sm text-75">分类
                    <select aria-label="筛选分类" class="archive-input" value={uncategorized ? '__uncategorized' : selectedCategories.length === 1 ? selectedCategories[0] : ''} on:change={event => selectCategory(event.currentTarget.value)}>
                        <option value="">全部分类</option>
                        {#each categories as category}<option value={category}>{getCategoryLabel(category)}</option>{/each}
                        {#if sortedPosts.some(post => !post.data.category)}<option value="__uncategorized">未分类</option>{/if}
                    </select>
                </label>
                <label class="text-sm text-75">标签
                    <select aria-label="筛选标签" class="archive-input" value={tagsOutsideCategory.length ? '__preserved_tags__' : selectedTags.length === 1 ? selectedTags[0] : ''} on:change={event => { selectedTags = event.currentTarget.value ? [event.currentTarget.value] : []; updateUrl(); }}>
                        <option value="">全部标签</option>
                        {#if tagsOutsideCategory.length}<option value="__preserved_tags__" disabled>已选标签不在当前分类</option>{/if}
                        {#each availableTags as tag}<option value={tag}>{tag}</option>{/each}
                    </select>
                </label>
                <div class="archive-keyword text-sm text-75">
                    <div class="keyword-options">
                        <label for="archive-keyword">关键词</label>
                        {#if frontendConfig.search.matchCaseOption}
                            <label class="search-match-case"><input type="checkbox" bind:checked={caseSensitive} on:change={event => { caseSensitive = event.currentTarget.checked; updateUrl(); }} />匹配大小写</label>
                        {/if}
                    </div>
                    <input id="archive-keyword" aria-label="筛选文章关键词" type="search" class="archive-input" placeholder="标题、简介或标签" bind:value={keyword} on:input={event => { keyword = event.currentTarget.value; updateUrl(); }} />
                </div>
            </div>
            {#if hasFilters}
                <div class="flex flex-wrap items-center gap-2 mt-4 text-sm">
                    {#each selectedCategories as category}<span class="filter-label">{getCategoryLabel(category)}</span>{/each}
                    {#each selectedTags as tag}<span class="filter-label">#{tag}</span>{/each}
                    {#if uncategorized}<span class="filter-label">未分类</span>{/if}
                    {#if keyword.trim()}<span class="filter-label">关键词：{keyword.trim()}</span>{/if}
                    <button class="btn-plain rounded-lg px-3 py-1" on:click={clearFilters}>清除筛选</button>
                </div>
            {/if}
        </div>
        {#if ready && groups.length === 0}
            <div class="text-center py-12 text-50" role="status">
                <p>没有找到符合条件的文章。</p>
                <button class="btn-regular rounded-lg px-4 py-2 mt-4 mx-auto" on:click={clearFilters}>查看全部文章</button>
            </div>
        {/if}
    {/if}
    {#each groups as group}
        <div>
            <div class="flex flex-row w-full items-center h-[3.75rem]">
                <div class="w-[15%] md:w-[10%] transition text-2xl font-bold text-right text-75">
                    {group.year}
                </div>
                <div class="w-[15%] md:w-[10%]">
                    <div
                            class="h-3 w-3 bg-none rounded-full outline outline-[var(--primary)] mx-auto
                  -outline-offset-[2px] z-50 outline-3"
                    ></div>
                </div>
                <div class="w-[70%] md:w-[80%] transition text-left text-50">
                    {group.posts.length} {i18n(group.posts.length === 1 ? I18nKey.postCount : I18nKey.postsCount)}
                </div>
            </div>

            {#each group.posts as post}
                <a
                        href={post.url || `/posts/${post.id}/`}
                        aria-label={post.data.title}
                        class="archive-post group btn-plain !block h-10 w-full rounded-lg hover:text-[initial]"
                        class:search-result={!!keyword.trim()}
                >
                    <div class="flex flex-row justify-start items-center h-full">
                        <!-- date -->
                        <div class="w-[15%] md:w-[10%] transition text-sm text-right text-50">
                            {formatDate(post.data.published)}
                        </div>

                        <!-- dot and line -->
                        <div class="w-[15%] md:w-[10%] relative dash-line h-full flex items-center">
                            <div
                                    class="transition-all mx-auto w-1 h-1 rounded group-hover:h-5
                       bg-[oklch(0.5_0.05_var(--hue))] group-hover:bg-[var(--primary)]
                       outline outline-4 z-50
                       outline-[var(--card-bg)]
                       group-hover:outline-[var(--btn-plain-bg-hover)]
                       group-active:outline-[var(--btn-plain-bg-active)]"
                            ></div>
                        </div>

                        <!-- post title -->
                        <div
                                class="post-summary w-[70%] md:max-w-[65%] md:w-[65%] text-left font-bold
                     group-hover:translate-x-1 transition-all group-hover:text-[var(--primary)]
                     text-75 pr-8"
                        >
                            <div class="post-title">{@html renderSearchText(post.data.title, keyword, caseSensitive)}</div>
                            {#if keyword.trim() && frontendConfig.search.highlightMatches}
                                {@const excerpt = matchingSearchExcerpt(post.data.description || "", keyword, caseSensitive)}
                                {@const matchedTags = post.data.tags.filter(tag => matchingSearchExcerpt(tag, keyword, caseSensitive))}
                                {#if excerpt}<p class="search-description text-sm text-50 font-normal">{@html renderSearchText(excerpt, keyword, caseSensitive)}</p>{/if}
                                {#if matchedTags.length}
                                    <div class="search-tags font-normal" aria-label="匹配的标签">
                                        {#each matchedTags as tag}<span>#{@html renderSearchText(tag, keyword, caseSensitive)}</span>{/each}
                                    </div>
                                {/if}
                            {/if}
                        </div>

                        <!-- tag list -->
                        {#if !keyword.trim()}<div
                                class="hidden md:block md:w-[15%] text-left text-sm transition
                     whitespace-nowrap overflow-ellipsis overflow-hidden text-30"
                        >
                            {formatTag(post.data.tags)}
                        </div>{/if}
                    </div>
                </a>
            {/each}
        </div>
    {/each}
</div>

<style>
.archive-filters { container-type: inline-size; }
.archive-filter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
.archive-filter-grid > * { min-width: 0; }
.keyword-options { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.35rem; }
@container (max-width: 640px) {
 .archive-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 .archive-keyword { grid-column: 1 / -1; }
}
@container (max-width: 380px) {
 .archive-filter-grid { grid-template-columns: minmax(0, 1fr); }
}
.post-summary { min-width: 0; }
.post-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.archive-post.search-result { height: auto; min-height: 2.5rem; }
.search-result > div { align-items: stretch; }
.search-result > div > :first-child { align-self: center; }
.search-result .dash-line { height: auto; }
.search-result .post-summary { padding-block: 0.5rem; padding-right: 0.5rem; }
.search-result .post-title, .search-description { white-space: normal; overflow-wrap: anywhere; }
.search-description { margin-top: 0.35rem; }
@media (min-width: 768px) {
 .search-result .post-summary { width: 80%; max-width: 80%; }
}
.archive-input {
 display: block; width: 100%; min-width: 0; margin-top: 0.5rem;
 padding: 0.65rem 0.75rem; border: 1px solid var(--line-divider); border-radius: 0.5rem;
 background: var(--card-bg); color: inherit; font: inherit;
}
.archive-input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.filter-label { padding: 0.25rem 0.6rem; border-radius: 0.5rem; background: var(--btn-regular-bg); color: var(--btn-content); overflow-wrap: anywhere; }
</style>
