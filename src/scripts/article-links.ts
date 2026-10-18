import { chapterUrl, updateChapterUrl } from "../utils/article-links";
import { copyText } from "../utils/clipboard";
import { onPageView, runOnce } from "../utils/page-view";

runOnce("article-links", () => {
	const timers = new Set<number>();
	const init = () => {
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
		for (const heading of document.querySelectorAll<HTMLElement>("#post-container .markdown-content :is(h1,h2,h3,h4,h5,h6)[id]")) {
			heading.querySelector(".anchor")?.setAttribute("data-no-swup", "");
			if (heading.querySelector(".chapter-copy")) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "chapter-copy";
			button.setAttribute("aria-label", "复制本节链接");
			button.title = "复制本节链接";
			button.dataset.pagefindIgnore = "";
			button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
			heading.append(button);
		}
	};
	document.addEventListener("click", async event => {
		const target = event.target instanceof Element ? event.target : null;
		const button = target?.closest<HTMLButtonElement>(".chapter-copy");
		const anchor = target?.closest<HTMLAnchorElement>("#post-container .markdown-content .anchor");
		const heading = (button || anchor)?.closest<HTMLElement>("[id]");
		if (!heading || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		if (button) {
			try { await copyText(chapterUrl(heading.id)); button.dataset.state = "copied"; }
			catch { button.dataset.state = "failed"; }
			if (!button.isConnected) return;
			button.setAttribute("aria-label", button.dataset.state === "copied" ? "已复制本节链接" : "复制失败，请手动复制地址");
			const timer = window.setTimeout(() => {
				delete button.dataset.state;
				button.setAttribute("aria-label", "复制本节链接");
				timers.delete(timer);
			}, 2000);
			timers.add(timer);
		} else {
			updateChapterUrl(heading.id);
			window.scrollTo({ top: heading.getBoundingClientRect().top + scrollY - 80, behavior: "instant" });
		}
	});
	init();
	onPageView(init);
});
