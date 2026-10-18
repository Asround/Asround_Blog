import { onPageView, runOnce } from "../utils/page-view";

type Recovery = { panel: HTMLElement; frame?: HTMLElement; media?: Element; timer?: number };
const selector = "#post-container .markdown-content img, [data-image-recovery] img";

runOnce("image-recovery", () => {
	let states = new WeakMap<HTMLImageElement, Recovery>();
	const timers = new Set<number>();
	function stop(state: Recovery) {
		if (state.timer) { clearTimeout(state.timer); timers.delete(state.timer); state.timer = undefined; }
	}
	function recovered(image: HTMLImageElement) {
		const state = states.get(image);
		if (!state || !image.naturalWidth) return;
		stop(state);
		image.classList.remove("image-load-failed");
		state.panel.remove();
		if (state.frame && state.media) state.frame.replaceWith(state.media);
		states.delete(image);
	}
	function failed(image: HTMLImageElement) {
		if (!image.matches(selector) || !image.getAttribute("src")) return;
		const existing = states.get(image);
		if (existing) {
			stop(existing);
			existing.panel.querySelector("button")!.disabled = false;
			existing.panel.querySelector("[role=status]")!.textContent = "图片加载失败";
			return;
		}
		const panel = document.createElement("span");
		panel.className = "image-recovery-panel";
		panel.dataset.pagefindIgnore = "";
		const message = document.createElement("span");
		message.setAttribute("role", "status");
		message.textContent = "图片加载失败";
		const retry = document.createElement("button");
		retry.type = "button";
		retry.textContent = "重试";
		retry.className = "btn-regular";
		panel.append(message, retry);
		let original: URL | undefined;
		try { original = new URL(image.dataset.originalSrc || image.currentSrc || image.src, location.href); } catch { /* Invalid image URLs still offer retry. */ }
		if (original && ["http:", "https:"].includes(original.protocol)) {
			const link = document.createElement("a");
			link.href = original.href;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
			link.dataset.noSwup = "";
			link.textContent = "查看原图";
			panel.append(link);
		}
		const state: Recovery = { panel };
		const wrapper = image.closest("[data-image-recovery]");
		if (wrapper) wrapper.append(panel);
		else {
			const media = image.closest("a") || image;
			const rect = image.getBoundingClientRect();
			const frame = document.createElement("span");
			frame.className = "image-recovery-frame";
			frame.style.width = `${rect.width || 360}px`;
			frame.style.aspectRatio = `${rect.width || 360} / ${rect.height || 160}`;
			media.before(frame);
			frame.append(media, panel);
			state.frame = frame;
			state.media = media;
		}
		image.classList.add("image-load-failed");
		states.set(image, state);
		retry.addEventListener("click", event => {
			event.preventDefault();
			event.stopPropagation();
			if (retry.disabled) return;
			retry.disabled = true;
			message.textContent = "正在重试…";
			image.loading = "eager";
			// Reassign the same source: signed external URLs and srcset stay intact.
			image.src = image.src;
			state.timer = window.setTimeout(() => {
				stop(state);
				retry.disabled = false;
				message.textContent = "加载超时，可再次重试或查看原图";
			}, 10000);
			timers.add(state.timer);
		});
	}
	document.addEventListener("error", event => { if (event.target instanceof HTMLImageElement) failed(event.target); }, true);
	document.addEventListener("load", event => { if (event.target instanceof HTMLImageElement) recovered(event.target); }, true);
	function init() {
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
		// Cached Swup pages may retain recovery markup; restore it before rescanning.
		for (const panel of document.querySelectorAll(".image-recovery-panel")) panel.remove();
		for (const frame of document.querySelectorAll(".image-recovery-frame")) frame.replaceWith(...frame.childNodes);
		for (const image of document.querySelectorAll<HTMLImageElement>(selector)) image.classList.remove("image-load-failed");
		states = new WeakMap();
		for (const image of document.querySelectorAll<HTMLImageElement>(selector)) if (image.complete && !image.naturalWidth) failed(image);
	}
	init();
	onPageView(init);
});
