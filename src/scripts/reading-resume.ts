import { onPageView, runOnce } from "../utils/page-view";

const storageKey = "reader-progress-v1";
type Bookmark = { heading: string; updatedAt: number };
function readBookmarks(): Record<string, Bookmark> {
	try {
		const raw = localStorage.getItem(storageKey);
		if (!raw || raw.length > 65536) return {};
		const value = JSON.parse(raw);
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		return Object.fromEntries(Object.entries(value).filter(([path, item]) => {
			const mark = item as Bookmark;
			return path.startsWith("/") && mark && typeof mark.heading === "string" && mark.heading.length <= 1024 &&
				Number.isFinite(mark.updatedAt) && mark.updatedAt <= Date.now() && Date.now() - mark.updatedAt < 90 * 86400000;
		}).sort((a, b) => (b[1] as Bookmark).updatedAt - (a[1] as Bookmark).updatedAt).slice(0, 30)) as Record<string, Bookmark>;
	} catch { return {}; }
}
function writeBookmark(path: string, bookmark?: Bookmark) {
	try {
		const marks = readBookmarks();
		delete marks[path];
		const entries = Object.entries(marks);
		if (bookmark) entries.unshift([path, bookmark]);
		localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(entries.slice(0, 30))));
	} catch { /* Storage can be blocked or full; reading remains available. */ }
}

runOnce("reading-resume", () => {
	let cleanup = () => {};
	let flush = () => {};
	function init() {
		cleanup();
		flush = () => {};
		const panel = document.querySelector<HTMLElement>("[data-reading-resume]");
		const content = document.querySelector<HTMLElement>("#post-container .markdown-content");
		if (!panel || !content) return;
		const path = panel.dataset.readingResume!;
		const headings = Array.from(content.querySelectorAll<HTMLElement>("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]"));
		if (headings.length < 4 || content.offsetHeight < innerHeight * 2) return;
		const controller = new AbortController();
		const { signal } = controller;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let moved = false;
		const bookmark = readBookmarks()[path];
		const target = bookmark && headings.find(heading => heading.id === bookmark.heading);
		if (bookmark && !target) writeBookmark(path);
		if (target && !location.hash) {
			panel.querySelector("[data-resume-title]")!.textContent = target.textContent?.replace(/#$/, "").trim() || target.id;
			panel.hidden = false;
		}
		const save = () => {
			if (!moved || !content.isConnected) return;
			const rect = content.getBoundingClientRect();
			if (rect.bottom <= innerHeight + 40) { writeBookmark(path); return; }
			let current: HTMLElement | undefined;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top > 160) break;
				current = heading;
			}
			if (current && current !== headings[0]) writeBookmark(path, { heading: current.id, updatedAt: Date.now() });
		};
		flush = save;
		// Wait for actual reader interaction, so initial layout/fragment restoration never erases a saved chapter.
		const arm = () => { moved = true; };
		window.addEventListener("wheel", arm, { passive: true, signal });
		window.addEventListener("touchmove", arm, { passive: true, signal });
		document.addEventListener("keydown", event => {
			if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key) &&
				!(event.target as HTMLElement)?.closest("input,textarea,[contenteditable=true]")) arm();
		}, { signal });
		document.addEventListener("pointerdown", event => {
			if ((event.target as Element)?.closest("[data-toc-scroll], .toc, [data-resume-continue]") || event.clientX >= innerWidth - 20) arm();
		}, { signal });
		document.addEventListener("click", event => {
			if ((event.target as Element)?.closest('[data-toc-scroll] a, .toc a')) arm();
		}, { signal });
		window.addEventListener("scroll", () => {
			clearTimeout(timer);
			if (moved) timer = setTimeout(save, 250);
		}, { passive: true, signal });
		panel.querySelector("[data-resume-continue]")!.addEventListener("click", () => {
			panel.hidden = true;
			if (!target?.isConnected) return;
			moved = true;
			window.scrollTo({ top: target.getBoundingClientRect().top + scrollY - 120, behavior: "instant" });
			const tabIndex = target.getAttribute("tabindex");
			target.tabIndex = -1;
			target.focus({ preventScroll: true });
			target.addEventListener("blur", () => {
				if (tabIndex === null) target.removeAttribute("tabindex");
				else target.setAttribute("tabindex", tabIndex);
			}, { once: true, signal });
		}, { signal });
		panel.querySelector("[data-resume-dismiss]")!.addEventListener("click", () => {
			panel.hidden = true;
			writeBookmark(path);
		}, { signal });
		cleanup = () => { controller.abort(); clearTimeout(timer); };
	}
	init();
	onPageView(init);
	// Flush before a clicked link can replace the article through Swup.
	document.addEventListener("click", event => {
		if ((event.target as Element)?.closest("a[href]")) flush();
	}, { capture: true });
	window.addEventListener("pagehide", () => flush());
	document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
});
