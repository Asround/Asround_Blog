import type { GiscusWidget } from "giscus";
import type { GiscusConfig } from "../types/config";
import bundledStylesheet from "../../public/giscus.css?raw";

const bundledTheme = `data:text/css;charset=utf-8,${encodeURIComponent(bundledStylesheet)}`;

export type CommentState = "waiting" | "loading" | "ready" | "slow" | "warning" | "limited" | "configuration" | "error" | "reload";

/** Each mounted article owns its widget, observers and timer. Never reload on theme changes. */
export function mountGiscus(
	host: HTMLElement,
	config: GiscusConfig,
	term: string,
	onState: (state: CommentState) => void,
	stylesheetUrl?: string,
) {
	let disposed = false;
	let generation = 0;
	let widget: GiscusWidget | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let intersection: IntersectionObserver | undefined;
	let assetRequest: AbortController | undefined;
	let dataReady = false;
	let inlineTheme: string | undefined;
	let themeResent = false;
	let themedFrame: HTMLIFrameElement | undefined;
	const theme = () => document.documentElement.classList.contains("dark") ? "dark" : "light";
	const syncColorScheme = () => {
		// Embedded prefers-color-scheme follows the iframe's color-scheme, including
		// cross-origin frames. Keep both palettes loaded instead of asynchronously
		// swapping giscus stylesheets after the page's view-transition snapshot.
		if (widget?.iframeRef) widget.iframeRef.style.colorScheme = theme();
	};
	const clearWidget = () => {
		clearTimeout(timer);
		assetRequest?.abort();
		assetRequest = undefined;
		themedFrame?.removeEventListener("load", onFrameLoad);
		themedFrame = undefined;
		widget?.remove();
		widget = undefined;
		inlineTheme = undefined;
		themeResent = false;
	};
	const onFrameLoad = () => { themeResent = false; syncColorScheme(); };
	const fail = (state: "error" | "reload" | "configuration" = "error") => {
		clearWidget();
		onState(state);
	};
	const ready = () => {
		// Metadata proves the child app is running. Re-send our theme in case its
		// initial load/config message raced the child's message-listener setup.
		if (inlineTheme && !themeResent && widget?.iframeRef?.contentWindow) {
			themeResent = true;
			widget.iframeRef.contentWindow.postMessage({ giscus: { setConfig: { theme: inlineTheme } } }, "https://giscus.app");
		}
		dataReady = true;
		clearTimeout(timer);
		onState("ready");
	};
	const receive = (event: MessageEvent) => {
		if (event.origin !== "https://giscus.app" || !widget?.iframeRef ||
			event.source !== widget.iframeRef.contentWindow) return;
		const message = event.data?.giscus;
		if (!message || typeof message !== "object") return;
		const error = String(message.error || "");
		// Empty discussions are a completed load, not a configuration failure.
		if (error.includes("Discussion not found")) {
			ready();
		} else if (/Bad credentials|Invalid state|expired/i.test(error)) {
			// The official component clears the expired session and reloads itself.
		} else if (error) {
			clearTimeout(timer);
			if (/rate.?limit|too many requests|\b429\b/i.test(error)) {
				// Retain the service's sign-in / rate-limit UI and any existing editor.
				onState("limited");
			} else if (!dataReady && /repository not found|category not found|not installed|invalid (?:repo|category)|not enabled/i.test(error)) {
				fail("configuration");
			} else {
				// A transient error must not destroy the iframe and its unsent draft.
				onState("warning");
			}
		} else if (message.discussion && typeof message.discussion.id === "string" && message.discussion.id.trim()) {
			ready();
		}
		// resizeHeight is layout information only: it neither proves that data has
		// arrived nor clears a warning. The official component handles iframe sizing.
	};
	const themes = new MutationObserver(() => {
		if (!document.documentElement.classList.contains("theme-circle-transition")) syncColorScheme();
	});
	themes.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
	document.addEventListener("theme:transition-update", syncColorScheme);
	window.addEventListener("message", receive);
	async function resolveTheme(): Promise<string> {
		if (!stylesheetUrl) return "preferred_color_scheme";
		// The standard blog theme ships with the component: no timeout, extra
		// iframe fetch, stale CDN response or localhost network permission.
		if (config.themeStylesheet?.split(/[?#]/, 1)[0] === "/giscus.css") return bundledTheme;
		const request = new AbortController();
		assetRequest = request;
		const timeout = setTimeout(() => request.abort(), 2000);
		try {
			// Other explicitly configured URLs retain their CSS base path. A failed
			// preflight uses the bundled blog theme, never a permanent official fallback.
			const response = await fetch(stylesheetUrl, { mode: "cors", signal: request.signal });
			const valid = response.ok && response.headers.get("content-type")?.includes("text/css");
			await response.body?.cancel();
			return valid ? stylesheetUrl : bundledTheme;
		} catch { return bundledTheme; }
		finally { clearTimeout(timeout); if (assetRequest === request) assetRequest = undefined; }
	}

	async function load() {
		if (disposed) return;
		intersection?.disconnect();
		const attempt = ++generation;
		clearWidget();
		dataReady = false;
		onState("loading");
		timer = setTimeout(() => {
			if (disposed || attempt !== generation) return;
			if (widget?.iframeRef) {
				// Late metadata may still recover without replacing an open editor.
				onState("slow");
			} else {
				++generation;
				fail();
			}
		}, 20000);
		let moduleLoaded = false;
		try {
			const { GiscusWidget } = await import("giscus");
			moduleLoaded = true;
			if (disposed || attempt !== generation) return;
			const widgetTheme = await resolveTheme();
			if (disposed || attempt !== generation) return;
			const usesInlineTheme = widgetTheme.startsWith("data:text/css;");
			inlineTheme = usesInlineTheme ? widgetTheme : undefined;
			const returningFromLogin = new URL(location.href).searchParams.has("giscus");
			const savedState = history.state;
			// The official component consumes OAuth callbacks. Preserve Swup's history state.
			// Construct directly so storage/privacy exceptions are caught here;
			// createElement reports custom-element constructor failures globally.
			const element = new GiscusWidget();
			if (returningFromLogin && savedState && history.state == null) {
				history.replaceState({ ...savedState, url: location.pathname + location.search + location.hash }, "", location.href);
			}
			widget = element;
			Object.assign(element, {
				id: "comments", repo: config.repo, repoId: config.repoId,
				category: config.category, categoryId: config.categoryId,
				mapping: "specific", term, strict: "1", reactionsEnabled: "0",
				emitMetadata: "1", inputPosition: "top", lang: "zh-CN",
				// Keep the iframe URL short; bundled CSS is sent via the official config
				// message after its initial render, including when it finishes loading.
				theme: usesInlineTheme ? "preferred_color_scheme" : widgetTheme, loading: "eager",
			});
			host.append(element);
			await element.updateComplete;
			if (disposed || attempt !== generation) return;
			themedFrame = element.iframeRef;
			themedFrame?.addEventListener("load", onFrameLoad);
			syncColorScheme();
			if (usesInlineTheme) element.theme = widgetTheme;
			if (returningFromLogin) host.closest("section")?.scrollIntoView({ block: "start" });
		} catch {
			if (!disposed && attempt === generation) fail(moduleLoaded ? "error" : "reload");
		}
	}

	if (new URL(location.href).searchParams.has("giscus") || !("IntersectionObserver" in window)) {
		void load();
	} else {
		intersection = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) void load();
		}, { rootMargin: "400px 0px" });
		intersection.observe(host);
	}
	return {
		retry: () => { void load(); },
		destroy: () => {
			disposed = true;
			++generation;
			intersection?.disconnect();
			themes.disconnect();
			document.removeEventListener("theme:transition-update", syncColorScheme);
			window.removeEventListener("message", receive);
			clearWidget();
		},
	};
}
