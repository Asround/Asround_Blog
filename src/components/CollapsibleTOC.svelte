<script lang="ts">
import { onMount } from "svelte";
import { siteConfig } from "../config";
import I18nKey from "../i18n/i18nKey";
import { i18n } from "../i18n/translation";
import { onPageView } from "../utils/page-view";

export let onNavigate: () => void = () => {};

type Heading = {
	id: string;
	text: string;
	level: number;
	parent: number;
	depth: number;
	children: number[];
	element: HTMLElement;
	badge: string;
};

let root: HTMLElement;
let items: Heading[] = [];
let expanded = new Set<string>();
let activeId = "";
let visibleItems: Heading[] = [];
let visibleActiveId = "";

function isVisible(item: Heading, headings: Heading[], expandedIds: Set<string>): boolean {
	let parent = item.parent;
	while (parent >= 0) {
		if (!expandedIds.has(headings[parent].id)) return false;
		parent = headings[parent].parent;
	}
	return true;
}

function activeAncestor(headings: Heading[], expandedIds: Set<string>, currentId: string): string {
	let item = headings.find((heading) => heading.id === currentId);
	while (item && !isVisible(item, headings, expandedIds)) item = headings[item.parent];
	return item?.id ?? "";
}

$: visibleItems = items.filter((item) => isVisible(item, items, expanded));
$: visibleActiveId = activeAncestor(items, expanded, activeId);
$: expandable = items.filter((item) => item.children.length > 0);

function updateActive() {
	let current = "";
	for (const item of items) {
		if (item.element.getBoundingClientRect().top > 150) break;
		current = item.id;
	}
	activeId = current;
}

function navigate(event: MouseEvent, item: Heading) {
	if (
		event.ctrlKey ||
		event.metaKey ||
		event.shiftKey ||
		event.altKey ||
		event.button !== 0
	)
		return;
	event.preventDefault();
	window.scrollTo({
		top: item.element.getBoundingClientRect().top + window.scrollY - 80,
		behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
			? "instant"
			: "smooth",
	});
	onNavigate();
	root.dispatchEvent(new CustomEvent("toc:navigate", { bubbles: true }));
}

function toggle(id: string) {
	const next = new Set(expanded);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	expanded = next;
}

onMount(() => {
	let signature = "";
	let observer: MutationObserver | undefined;
	let frame = 0;
	const cleanText = (element: Element) =>
		(element.textContent ?? "").replace(/#+\s*$/, "").trim();
	const generate = () => {
		const container = document.getElementById("post-container");
		const content = container?.querySelector(".custom-md");
		let headings = Array.from(
			content?.querySelectorAll<HTMLElement>(
				"h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
			) ?? [],
		);
		const title = container?.querySelector('[data-pagefind-meta="title"]');
		if (
			headings[0]?.tagName === "H1" &&
			title &&
			cleanText(headings[0]) === cleanText(title)
		) {
			headings = headings.slice(1);
		}
		headings = headings.filter(
			(heading) => Number(heading.tagName[1]) <= siteConfig.toc.depth,
		);
		const nextSignature = JSON.stringify([
			location.pathname,
			headings.map((heading) => [heading.id, cleanText(heading)]),
		]);
		if (
			signature === nextSignature &&
			items.every((item, index) => item.element === headings[index])
		)
			return;
		signature = nextSignature;
		const next: Heading[] = [];
		const stack: number[] = [];
		let rootCount = 0;
		for (const element of headings) {
			const level = Number(element.tagName[1]);
			while (stack.length && next[stack[stack.length - 1]].level >= level)
				stack.pop();
			const parent = stack[stack.length - 1] ?? -1;
			const depth = parent < 0 ? 0 : next[parent].depth + 1;
			if (parent < 0) rootCount++;
			const index = next.length;
			next.push({
				id: element.id,
				text: cleanText(element),
				level,
				parent,
				depth,
				children: [],
				element,
				badge: depth === 0
					? `${rootCount}.`
					: depth === 1
						? `${rootCount}-${next[parent].children.length + 1}.`
						: "•",
			});
			if (parent >= 0) next[parent].children.push(index);
			stack.push(index);
		}
		items = next;
		expanded = new Set(
			next
				.filter((item) =>
					item.children.some(
						(index) =>
							next[index].level <= (siteConfig.toc.defaultExpandedDepth ?? 3),
					),
				)
				.map((item) => item.id),
		);
		updateActive();
		root.dispatchEvent(
			new CustomEvent("toc:updated", {
				bubbles: true,
				detail: { count: items.length },
			}),
		);
	};
	const schedule = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(generate);
	};
	const init = () => {
		observer?.disconnect();
		generate();
		const container = document.getElementById("post-container");
		if (container) {
			observer = new MutationObserver(schedule);
			observer.observe(container, { childList: true, subtree: true });
		}
	};
	init();
	const unsubscribe = onPageView(init);
	window.addEventListener("scroll", updateActive, { passive: true });
	window.addEventListener("resize", updateActive);
	return () => {
		unsubscribe();
		observer?.disconnect();
		cancelAnimationFrame(frame);
		window.removeEventListener("scroll", updateActive);
		window.removeEventListener("resize", updateActive);
	};
});
</script>

<div bind:this={root} class="collapsible-toc">
	{#if items.length === 0}
		<p class="toc-empty">{i18n(I18nKey.tocEmpty)}</p>
	{:else}
		{#if expandable.length > 0}
			<div class="toc-controls">
				<button
					type="button"
					on:click={() => expanded = new Set(expandable.map((item) => item.id))}
					disabled={expandable.every((item) => expanded.has(item.id))}
				>{i18n(I18nKey.tocExpandAll)}</button>
				<button
					type="button"
					on:click={() => expanded = new Set()}
					disabled={expanded.size === 0}
				>{i18n(I18nKey.tocCollapseAll)}</button>
			</div>
		{/if}
		<nav class="toc-list" aria-label={i18n(I18nKey.tableOfContents)}>
			{#each visibleItems as item (item.id)}
				<div
					class="toc-row"
					class:active={visibleActiveId === item.id}
					style:padding-left={`${Math.min(item.depth, 3) * 0.5}rem`}
					data-level={item.level}
				>
					{#if item.children.length > 0}
						<button
							type="button"
							class="toc-toggle"
							aria-expanded={expanded.has(item.id)}
							aria-label={`${i18n(expanded.has(item.id) ? I18nKey.tocCollapse : I18nKey.tocExpand)} ${item.text}`}
							title={i18n(expanded.has(item.id) ? I18nKey.tocCollapse : I18nKey.tocExpand)}
							on:click={() => toggle(item.id)}
						>
							<svg class:expanded={expanded.has(item.id)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path d="m9 5 7 7-7 7" />
							</svg>
						</button>
					{:else}
						<span class="toc-toggle-space" aria-hidden="true"></span>
					{/if}
					<a
						data-no-swup
						href={`#${encodeURIComponent(item.id)}`}
						title={item.text}
						aria-current={visibleActiveId === item.id ? "location" : undefined}
						on:click={(event) => navigate(event, item)}
					>
						<span class="toc-marker" class:numbered={item.depth < 2}>{item.badge}</span>
						<span class="toc-text">{item.text}</span>
					</a>
				</div>
			{/each}
		</nav>
	{/if}
</div>

<style>
	.collapsible-toc {
		min-width: 0;
		color: rgba(0, 0, 0, 0.75);
	}
	:global(.dark) .collapsible-toc {
		color: rgba(255, 255, 255, 0.75);
	}
	.toc-controls {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0 0 0.5rem;
		margin-bottom: 0.25rem;
		border-bottom: 1px solid var(--line-color);
	}
	.toc-controls button {
		font-size: 0.75rem;
		padding: 0.25rem 0.4rem;
		border-radius: 0.375rem;
		color: var(--primary);
	}
	.toc-controls button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.toc-controls button:hover:not(:disabled),
	.toc-toggle:hover {
		background: var(--btn-plain-bg-hover);
	}
	.toc-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.toc-row {
		display: flex;
		align-items: flex-start;
		border-radius: 0.5rem;
		min-width: 0;
	}
	.toc-row:hover {
		background: var(--btn-plain-bg-hover);
	}
	.toc-row.active {
		background: var(--btn-plain-bg-active);
		color: var(--primary);
		font-weight: 600;
	}
	.toc-toggle,
	.toc-toggle-space {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 1.25rem;
		height: 2.25rem;
		border-radius: 0.375rem;
		color: var(--primary);
	}
	.toc-marker {
		flex: 0 0 0.75rem;
		padding-top: 0.075rem;
		color: var(--primary);
		font-size: 0.8rem;
	}
	.toc-marker.numbered {
		flex: 0 0 auto;
		min-width: 1.25rem;
		padding-right: 0.35rem;
		font-variant-numeric: tabular-nums;
	}
	.toc-toggle svg {
		transition: transform 0.15s ease;
	}
	.toc-toggle svg.expanded {
		transform: rotate(90deg);
	}
	.toc-row a {
		display: flex;
		align-items: flex-start;
		flex: 1;
		min-width: 0;
		padding: 0.45rem 0.35rem 0.45rem 0;
		font-size: 0.9rem;
		line-height: 1.5;
		text-decoration: none;
	}
	.toc-text {
		flex: 1;
		min-width: 0;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
		overflow-wrap: anywhere;
	}
	.toc-empty {
		padding: 1.5rem 0;
		text-align: center;
		opacity: 0.65;
	}
	button:focus-visible,
	a:focus-visible {
		outline: 2px solid var(--primary);
		outline-offset: -2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.toc-toggle svg {
			transition: none;
		}
	}
</style>
