/** Replace the current chapter without adding a history entry on every click. */
export function updateChapterUrl(id: string): void {
	const url = new URL(location.href);
	url.hash = id;
	const state = history.state;
	history.replaceState(state?.source === "swup" ? { ...state, url: url.pathname + url.search + url.hash } : state, "", url);
}

export function chapterUrl(id: string): string {
	const url = new URL(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || location.href);
	url.hash = id;
	return url.href;
}
