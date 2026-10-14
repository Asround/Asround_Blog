import {
	DARK_MODE,
	DEFAULT_THEME,
	// WALLPAPER_BANNER,
} from "@constants/constants";
import { frontendConfig, siteConfig } from "@/config";
import type { LIGHT_DARK_MODE, WALLPAPER_MODE } from "@/types/config";
import { tick } from "svelte";

export function normalizeReadingFontSize(value: number): number {
	const { minFontSize, maxFontSize, defaultFontSize, step } = frontendConfig.reading;
	if (!Number.isFinite(value)) return defaultFontSize;
	return Math.min(
		maxFontSize,
		Math.max(minFontSize, minFontSize + Math.round((value - minFontSize) / step) * step),
	);
}

export function getReadingFontSize(): number {
	try {
		const stored = localStorage.getItem("reading-font-size");
		return normalizeReadingFontSize(
			stored === null ? frontendConfig.reading.defaultFontSize : Number(stored),
		);
	} catch {
		return frontendConfig.reading.defaultFontSize;
	}
}

export function setReadingFontSize(value: number): void {
	const size = normalizeReadingFontSize(value);
	document.documentElement.style.setProperty("--reading-font-size", `${size}px`);
	try {
		localStorage.setItem("reading-font-size", String(size));
	} catch {
		// 禁用本地存储时仍允许调整当前页面。
	}
}

export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	// 在Swup页面切换时，config-carrier可能不存在，使用默认值
	if (!configCarrier) {
		return Number.parseInt(fallback);
	}
	return Number.parseInt(configCarrier.dataset.hue || fallback);
}

export function getHue(): number {
	const stored = localStorage.getItem("hue");
	return stored ? Number.parseInt(stored) : getDefaultHue();
}

export function setHue(hue: number): void {
	localStorage.setItem("hue", String(hue));
	const r = document.querySelector(":root") as HTMLElement;
	if (!r) {
		return;
	}
	r.style.setProperty("--hue", String(hue));
}

let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyThemeToDocument(theme: LIGHT_DARK_MODE, animate = true) {
	const root = document.documentElement;
	const dark = theme === DARK_MODE;
	const codeTheme = dark ? "github-dark" : "github-light";
	if (root.classList.contains("dark") === dark && root.dataset.theme === codeTheme) return;

	const duration = !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches
		? 0
		: Math.max(0, frontendConfig.themeTransitionMs);
	clearTimeout(themeTransitionTimer);
	root.style.setProperty("--theme-color-duration", duration + "ms");
	root.classList.toggle("theme-color-transition", duration > 0);
	root.classList.toggle("dark", dark);
	root.dataset.theme = codeTheme;
	themeTransitionTimer = setTimeout(
		() => root.classList.remove("theme-color-transition"),
		duration + 80,
	);
}

let themeRequest = 0;
let requestedTheme: LIGHT_DARK_MODE | undefined;
let activeThemeTransition: ViewTransition | undefined;
let activeThemeAnimation: Animation | undefined;

export function getCurrentTheme(): LIGHT_DARK_MODE {
	return requestedTheme ?? (document.documentElement.classList.contains("dark") ? DARK_MODE : "light");
}

function finishPageEntranceAnimations(): void {
	// Theme snapshots must not capture an unfinished page-sized animation surface.
	// Backwards fill releases these effects when finished; the entrance never restarts.
	for (const animation of document.getAnimations()) {
		if (!(animation instanceof CSSAnimation) ||
			!["fade-in-up", "fade-in"].includes(animation.animationName)) continue;
		const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
		if (target instanceof Element &&
			target.matches(".onload-animation, .onload-animation-fade-in")) {
			animation.finish();
		}
	}
}

export function setTheme(theme: LIGHT_DARK_MODE, event?: MouseEvent): void {
	const request = ++themeRequest;
	const interrupted = !!activeThemeTransition;
	activeThemeTransition?.skipTransition();
	activeThemeAnimation?.cancel();
	activeThemeAnimation = undefined;
	const root = document.documentElement;
	root.classList.remove("theme-circle-transition");
	requestedTheme = theme;
	try {
		localStorage.setItem("theme", theme);
	} catch {}
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const canAnimate = frontendConfig.themeTransitionEffect === "circle" &&
		frontendConfig.themeTransitionMs > 0 && !reducedMotion && !!document.startViewTransition;
	const dark = theme === DARK_MODE;
	if (interrupted || !canAnimate || root.classList.contains("dark") === dark) {
		applyThemeToDocument(theme, !interrupted);
		requestedTheme = undefined;
		return;
	}

	// Keyboard activation uses the button center; pointer activation starts at the click.
	const button = event?.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
	const x = event && event.detail > 0 ? event.clientX : button ? button.left + button.width / 2 : window.innerWidth / 2;
	const y = event && event.detail > 0 ? event.clientY : button ? button.top + button.height / 2 : window.innerHeight / 2;
	const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
	const clips = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`];
	clearTimeout(themeTransitionTimer);
	root.classList.remove("theme-color-transition");
	root.classList.add("theme-circle-transition");
	try {
		finishPageEntranceAnimations();
		const transition = document.startViewTransition(async () => {
			if (request !== themeRequest) return;
			applyThemeToDocument(theme, false);
			await tick();
		});
		activeThemeTransition = transition;
		const deadline = setTimeout(() => {
			if (request !== themeRequest) return;
			transition.skipTransition();
			applyThemeToDocument(theme, false);
		}, frontendConfig.themeCaptureTimeoutMs);
		void transition.ready.then(() => {
			clearTimeout(deadline);
			if (request !== themeRequest) return;
			activeThemeAnimation = root.animate({ clipPath: dark ? clips : [...clips].reverse() }, {
				duration: frontendConfig.themeTransitionMs,
				easing: "ease-in-out",
				// Keep the final clip until the view-transition snapshots are removed.
				fill: "forwards",
				pseudoElement: dark ? "::view-transition-new(root)" : "::view-transition-old(root)",
			});
			void activeThemeAnimation.finished.catch(() => {});
		}).catch(() => {
			clearTimeout(deadline);
			if (request === themeRequest) applyThemeToDocument(theme, false);
		});
		void transition.finished.catch(() => {}).finally(() => {
			clearTimeout(deadline);
			if (activeThemeTransition === transition) {
				activeThemeTransition = undefined;
				activeThemeAnimation?.cancel();
				activeThemeAnimation = undefined;
			}
			if (request !== themeRequest) return;
			root.classList.remove("theme-circle-transition");
			requestedTheme = undefined;
		});
	} catch {
		root.classList.remove("theme-circle-transition");
		requestedTheme = undefined;
		applyThemeToDocument(theme);
	}
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	return (localStorage.getItem("theme") as LIGHT_DARK_MODE) || DEFAULT_THEME;
}

export function getStoredWallpaperMode(): WALLPAPER_MODE {
	return (
		(localStorage.getItem("wallpaperMode") as WALLPAPER_MODE) ||
		siteConfig.wallpaperMode.defaultMode
	);
}

export function setWallpaperMode(mode: WALLPAPER_MODE): void {
	localStorage.setItem("wallpaperMode", mode);
	// 触发自定义事件通知其他组件壁纸模式已改变
	window.dispatchEvent(new CustomEvent("wallpaper-mode-change", { detail: { mode } }));
}
