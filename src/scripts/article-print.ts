import { onPageView, runOnce } from "../utils/page-view";

runOnce("article-print", () => {
	let busy = false;
	let opened: HTMLDetailsElement[] = [];
	const sources = new Map<HTMLImageElement, Record<string, string | null>>();
	let notice: HTMLElement | undefined;
	const restore = () => {
		for (const detail of opened) detail.open = false;
		opened = [];
		for (const [image, attributes] of sources) for (const [key, value] of Object.entries(attributes)) {
			if (value === null) image.removeAttribute(key); else image.setAttribute(key, value);
		}
		sources.clear();
	};
	const prepare = () => {
		for (const detail of document.querySelectorAll<HTMLDetailsElement>("#post-container .custom-md details:not([open])")) {
			opened.push(detail);
			detail.open = true;
		}
		for (const image of document.querySelectorAll<HTMLImageElement>("#post-container .custom-md img, #post-cover img")) {
			if (!sources.has(image)) sources.set(image, Object.fromEntries(["src", "srcset", "sizes", "loading"].map(key => [key, image.getAttribute(key)])));
			image.loading = "eager";
			if (image.dataset.printSrc) { image.removeAttribute("srcset"); image.removeAttribute("sizes"); image.src = image.dataset.printSrc; }
		}
	};
	window.addEventListener("beforeprint", prepare);
	window.addEventListener("afterprint", restore);
	onPageView(() => { restore(); notice?.remove(); notice = undefined; });
	const print = async (button?: HTMLButtonElement) => {
		const article = document.querySelector("#post-container .markdown-content");
		if (!article || busy) return;
		busy = true;
		notice?.remove(); notice = undefined;
		if (button) { button.disabled = true; button.textContent = "准备打印…"; }
		let timer = 0;
		try {
			prepare();
			const images = [...document.querySelectorAll<HTMLImageElement>("#post-container .custom-md img, #post-cover img")];
			await Promise.race([
				Promise.all([document.fonts.ready, ...images.map(image => image.decode())]),
				new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error("Print resources timed out")), 20000); }),
			]);
			if (article.isConnected) window.print();
		} catch {
			if (article.isConnected) {
				notice = document.createElement("p"); notice.setAttribute("role", "status"); notice.dataset.pagefindIgnore = "";
				notice.textContent = "部分图片尚未就绪，请稍后重试打印。";
				(button || document.querySelector("[data-print-article]"))?.after(notice);
			}
		} finally {
			clearTimeout(timer);
			restore();
			busy = false;
			if (button?.isConnected) { button.disabled = false; button.textContent = "打印 / PDF"; }
		}
	};
	document.addEventListener("click", event => {
		const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-print-article]") : null;
		if (button) void print(button);
	});
	document.addEventListener("keydown", event => {
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p" && document.querySelector("#post-container .markdown-content")) {
			event.preventDefault();
			void print();
		}
	});
});
