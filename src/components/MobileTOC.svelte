<script lang="ts">
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { navigateToPage } from "../utils/navigation-utils";
import { panelManager } from "../utils/panel-manager.js";
import { onPageView } from "../utils/page-view";
import CollapsibleTOC from "./CollapsibleTOC.svelte";

let postItems: Array<{
	title: string;
	url: string;
	category?: string;
	pinned?: boolean;
}> = [];
let isHomePage = false;

const togglePanel = async () => {
	await panelManager.togglePanel("mobile-toc-panel");
};
const setPanelVisibility = async (show: boolean): Promise<void> => {
	await panelManager.togglePanel("mobile-toc-panel", show);
};
const navigateToPost = (url: string) => {
	setPanelVisibility(false);
	navigateToPage(url);
};

function init() {
	const pathname = window.location.pathname;
	isHomePage =
		pathname === "/" || pathname === "" || /^\/\d+\/?$/.test(pathname);
	if (isHomePage) {
		postItems = Array.from(document.querySelectorAll(".card-base")).flatMap(
			(card) => {
				const titleLink = card.querySelector<HTMLAnchorElement>(
					"a.transition.group.font-bold",
				);
				const title = titleLink?.textContent?.replace(/\s+/g, " ").trim();
				if (!titleLink || !title) return [];
				return [
					{
						title,
						url: titleLink.getAttribute("href") ?? "/",
						category: card
							.querySelector('a[href*="/categories/"].link-lg')
							?.textContent?.trim(),
						pinned: !!titleLink.querySelector('svg[data-icon="mdi:pin"]'),
					},
				];
			},
		);
	}
}

onMount(() => {
	init();
	const refresh = () => {
		setPanelVisibility(false);
		init();
	};
	const unsubscribe = onPageView(refresh);
	(window as any).mobileTOCInit = init;
	return () => {
		unsubscribe();
		if ((window as any).mobileTOCInit === init)
			delete (window as any).mobileTOCInit;
	};
});
</script>

<!-- TOC toggle button for mobile -->
<button
	on:click={togglePanel}
	aria-label="Table of Contents"
	id="mobile-toc-switch"
	class="btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90 lg:!hidden theme-switch-btn"
>
	<Icon icon="material-symbols:format-list-bulleted" class="text-[1.25rem]" />
</button>

<!-- Mobile TOC Panel -->
<div 
	id="mobile-toc-panel" 
	class="float-panel float-panel-closed mobile-toc-panel absolute md:w-[20rem] w-[calc(100vw-2rem)]
		top-20 left-4 md:left-[unset] right-4 shadow-2xl rounded-2xl p-4"
>
	<div class="flex items-center justify-between mb-4">
		<h3 class="text-lg font-bold text-[var(--primary)]">{isHomePage ? i18n(I18nKey.postList) : i18n(I18nKey.tableOfContents)}</h3>
		<button 
			on:click={togglePanel}
			aria-label="Close TOC"
			class="btn-plain rounded-lg h-8 w-8 active:scale-90 theme-switch-btn"
		>
			<Icon icon="material-symbols:close" class="text-[1rem]" />
		</button>
	</div>

	{#if isHomePage}
		{#if postItems.length === 0}
			<div class="text-center py-8 text-black/50 dark:text-white/50">
				<Icon icon="material-symbols:article-outline" class="text-2xl mb-2" />
				<p>暂无文章</p>
			</div>
		{:else}
			<div class="post-content">
				{#each postItems as post}
					<button
						on:click={() => navigateToPost(post.url)}
						class="post-item"
					>
						<div class="post-title">
							{#if post.pinned}
								<Icon icon="mdi:pin" class="pinned-icon" />
							{/if}
							{post.title}
						</div>
						{#if post.category}
							<div class="post-category">{post.category}</div>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<CollapsibleTOC onNavigate={() => setPanelVisibility(false)} />
	{/if}
</div>

<style>
	.mobile-toc-panel {
		max-height: calc(100vh - 120px);
		overflow-y: auto;
		background: var(--card-bg);
		border: 1px solid var(--line-color);
		backdrop-filter: blur(10px);
	}

	/* 确保主题切换按钮的背景色即时更新 */
	:global(.theme-switch-btn)::before {
		transition:
			transform 75ms ease-out,
			background-color 0ms !important;
	}

	.post-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.post-item {
		display: block;
		width: 100%;
		text-align: left;
		padding: 12px;
		border-radius: 8px;
		transition: all 0.2s ease;
		border: none;
		background: transparent;
		cursor: pointer;
		border: 1px solid var(--line-color);
	}

	.post-item:hover {
		background: var(--btn-plain-bg-hover);
		border-color: var(--primary);
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.post-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.75);
		margin-bottom: 4px;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .post-title {
		color: rgba(255, 255, 255, 0.75);
	}

	.post-category {
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.5);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .post-category {
		color: rgba(255, 255, 255, 0.5);
	}

	:global(.pinned-icon) {
		display: inline;
		color: var(--primary);
		font-size: 1.25rem;
		margin-right: 0.5rem;
		transform: translateY(-0.125rem);
		vertical-align: middle;
	}

	.post-item:hover .post-title {
		color: var(--primary);
	}

	.post-item:hover .post-category {
		color: rgba(0, 0, 0, 0.75);
	}

	:global(.dark) .post-item:hover .post-category {
		color: rgba(255, 255, 255, 0.75);
	}

	/* 滚动条样式 */
	.mobile-toc-panel::-webkit-scrollbar {
		width: 4px;
	}

	.mobile-toc-panel::-webkit-scrollbar-track {
		background: transparent;
	}

	.mobile-toc-panel::-webkit-scrollbar-thumb {
		background: var(--line-color);
		border-radius: 2px;
	}

	.mobile-toc-panel::-webkit-scrollbar-thumb:hover {
		background: var(--text-color-25);
	}
</style>