import { frontendConfig } from "../config";
import { searchPattern } from "../utils/search-utils";
import { onPageView, runOnce } from "../utils/page-view";

runOnce("search-highlights", () => {
	let marks: HTMLElement[] = [];
	let panel: HTMLElement | undefined;
	let timer = 0;
	const clear = () => {
		clearTimeout(timer);
		panel?.remove(); panel = undefined;
		for (const mark of marks) {
			const parent = mark.parentNode;
			mark.replaceWith(...mark.childNodes);
			parent?.normalize();
		}
		marks = [];
	};
	const init = () => {
		clear();
		const root = document.querySelector<HTMLElement>("#post-container .markdown-content");
		const params = new URLSearchParams(location.search);
		const query = (params.get("highlight") || "").trim().slice(0, 300);
		const pattern = searchPattern(query, params.get("highlightCase") === "1");
		if (!root || !pattern || !frontendConfig.search.highlightMatches) return;
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode: node => node.parentElement?.closest("script,style,textarea,button,.katex,math,.anchor,[data-pagefind-ignore],mark")
				? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
		});
		const nodes: Text[] = [];
		while (walker.nextNode()) nodes.push(walker.currentNode as Text);
		for (const node of nodes) {
			const text = node.data;
			const fragment = document.createDocumentFragment();
			let offset = 0;
			for (const match of text.matchAll(pattern)) {
				fragment.append(document.createTextNode(text.slice(offset, match.index)));
				const mark = document.createElement("mark");
				mark.className = "article-search-match";
				mark.textContent = match[0];
				fragment.append(mark); marks.push(mark);
				offset = match.index! + match[0].length;
			}
			if (offset) { fragment.append(document.createTextNode(text.slice(offset))); node.replaceWith(fragment); }
		}
		panel = document.createElement("div");
		panel.className = "article-search-navigation";
		panel.dataset.pagefindIgnore = "";
		panel.setAttribute("role", "region"); panel.setAttribute("aria-label", "正文搜索定位");
		const label = document.createElement("span"); label.className = "article-search-query"; label.textContent = query; label.title = query;
		const status = document.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
		let current = -1;
		const move = (direction: number, scroll = true) => {
			marks[current]?.classList.remove("article-search-current");
			if (marks.length) {
				current = (current + direction + marks.length) % marks.length;
				const mark = marks[current]; mark.classList.add("article-search-current");
				if (scroll) {
					for (let detail = mark.closest("details"); detail; detail = detail.parentElement?.closest("details") || null) detail.open = true;
					mark.scrollIntoView({ block: "center", behavior: "instant" });
				}
			}
			status.textContent = marks.length ? `${current + 1} / ${marks.length}` : "正文无匹配，可能命中标题或标签";
		};
		panel.append(label, status);
		for (const [text, direction] of [["上一个命中", -1], ["下一个命中", 1]] as const) {
			const button = document.createElement("button"); button.type = "button"; button.textContent = text; button.disabled = !marks.length;
			button.addEventListener("click", () => move(direction)); panel.append(button);
		}
		const close = document.createElement("button"); close.type = "button"; close.textContent = "关闭"; close.setAttribute("aria-label", "关闭正文搜索高亮");
		close.addEventListener("click", () => {
			clear();
			const next = new URL(location.href); next.searchParams.delete("highlight"); next.searchParams.delete("highlightCase");
			const state = history.state;
			history.replaceState(state?.source === "swup" ? { ...state, url: next.pathname + next.search + next.hash } : state, "", next);
			root.tabIndex = -1; root.focus({ preventScroll: true });
		});
		panel.append(close); document.body.append(panel);
		move(1, false);
		// Explicit chapter links keep priority over automatic search scrolling.
		if (!location.hash && marks.length) timer = window.setTimeout(() => { if (root.isConnected) move(0); }, 150);
	};
	init(); onPageView(init);
});
