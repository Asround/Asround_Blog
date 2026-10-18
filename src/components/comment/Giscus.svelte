<script lang="ts">
	import { onMount } from "svelte";
	import type { GiscusConfig } from "@/types/config";
	import { mountGiscus, type CommentState } from "@/utils/giscus-controller";

	let { config, term, discussionsUrl, stylesheetUrl }: {
		config: GiscusConfig; term: string; discussionsUrl: string; stylesheetUrl?: string;
	} = $props();
	let host: HTMLDivElement;
	let state = $state<CommentState>("waiting");
	const statusText: Record<CommentState, string> = {
		waiting: "滚动到此处时加载评论。",
		loading: "正在加载评论…",
		ready: "",
		slow: "评论加载时间较长，可以继续等待或重新加载。",
		warning: "评论服务暂时出现异常，已保留评论区域，可稍后再试。",
		limited: "评论服务暂时限流，请稍后再试；若未登录，可尝试在下方登录 GitHub。",
		configuration: "评论配置暂不可用，请稍后重试或前往 GitHub 讨论区。",
		error: "暂时无法连接评论服务。",
		reload: "评论组件加载失败，请刷新页面后重试。",
	};
	const keepsEditor = $derived(state === "slow" || state === "warning" || state === "limited");
	let controller: ReturnType<typeof mountGiscus> | undefined;
	onMount(() => {
		controller = mountGiscus(host, config, term, (next) => { state = next; }, stylesheetUrl);
		return () => { controller?.destroy(); };
	});
</script>

<section id="article-comments" tabindex="-1" aria-labelledby="article-comments-heading" class="card-base p-6 mb-4" data-pagefind-ignore data-comment-provider="giscus" data-comment-term={term}>
	<div class="comment-heading">
		<h2 id="article-comments-heading" class="text-xl font-bold text-90">评论</h2>
		<a class="comment-github text-sm" href={discussionsUrl} target="_blank" rel="noopener noreferrer" data-no-swup>GitHub 讨论区 <span aria-hidden="true">↗</span></a>
	</div>
	<p class="text-sm text-75 mb-4">使用 GitHub 账号留言，支持 Markdown、代码和公式。</p>
	<details class="comment-help text-sm text-75">
		<summary>Markdown 与公式写法</summary>
		<div class="comment-help-content">
			<p>支持加粗、链接与代码块。代码块用三个反引号包围，并在开头注明语言（如 python）。</p>
			<p>行内公式：<code>{'$`E=mc^2`$'}</code>；行间公式用独占一行的 <code>$$</code> 包围，公式前后留空行。</p>
			<p>可先点击“预览”确认效果，再发布评论。留言及 GitHub 用户名会公开显示。</p>
		</div>
	</details>
	<div aria-live="polite" class="text-sm text-75">
		{#if state !== "ready"}<p>{statusText[state]}</p>{/if}
		{#if state !== "waiting" && state !== "loading" && state !== "ready"}
			{#if keepsEditor}<p class="mt-1">重新加载会清空尚未发送的留言，请先复制保存。</p>{/if}
			<div class="flex flex-wrap gap-4 mt-2 mb-4">
				<button type="button" class="btn-regular rounded-lg px-3 py-2" onclick={() => state === "reload" ? window.location.reload() : controller?.retry()}>{state === "reload" ? "刷新页面" : "重新加载"}</button>
				<a class="underline underline-offset-4 self-center" href={discussionsUrl} target="_blank" rel="noopener noreferrer">前往 GitHub 讨论区</a>
			</div>
		{/if}
	</div>
	<div bind:this={host} class={state === "error" || state === "reload" || state === "configuration" ? "" : "min-h-[150px]"}></div>
</section>

<style>
	#article-comments { scroll-margin-top: 6rem; }
	#article-comments:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
	.comment-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .5rem; margin-bottom: .5rem; }
	.comment-github { color: var(--primary); text-decoration: underline; text-underline-offset: 3px; }
	.comment-help { margin-bottom: 1rem; }
	.comment-help summary { width: fit-content; cursor: pointer; color: var(--primary); }
	.comment-help summary:focus-visible, .comment-github:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
	.comment-help-content { margin-top: .75rem; padding: .75rem 1rem; border-radius: .5rem; background: var(--codeblock-bg); }
	.comment-help-content p + p { margin-top: .5rem; }
	.comment-help-content code { color: var(--primary); overflow-wrap: anywhere; }
</style>
