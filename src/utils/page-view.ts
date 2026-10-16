const initializedScripts = new Set<string>();

/** Shared scripts may be inlined in production and re-executed by Swup. */
export function runOnce(key: string, initialize: () => void): void {
	if (initializedScripts.has(key)) return;
	initializedScripts.add(key);
	try { initialize(); }
	catch (error) { initializedScripts.delete(key); throw error; }
}

/** Subscribe only our own handler, including when Swup starts after hydration. */
export function onPageView(callback: () => void): () => void {
	let subscribedSwup: typeof window.swup | undefined;
	const subscribe = () => {
		if (!window.swup || subscribedSwup === window.swup) return;
		subscribedSwup?.hooks.off("page:view", callback);
		subscribedSwup = window.swup;
		subscribedSwup.hooks.on("page:view", callback);
	};
	subscribe();
	document.addEventListener("swup:enable", subscribe);
	const timer = window.setTimeout(subscribe, 1000);
	window.addEventListener("popstate", callback);
	return () => {
		window.clearTimeout(timer);
		document.removeEventListener("swup:enable", subscribe);
		window.removeEventListener("popstate", callback);
		subscribedSwup?.hooks.off("page:view", callback);
	};
}
