import { runOnce } from "../utils/page-view";

runOnce("article-print", () => {
	let busy = false;
	let opened: HTMLDetailsElement[] = [];
	const restore = () => {
		for (const detail of opened) detail.open = false;
		opened = [];
	};
	window.addEventListener("beforeprint", () => {
		for (const detail of document.querySelectorAll<HTMLDetailsElement>("#post-container .custom-md details:not([open])")) {
			opened.push(detail);
			detail.open = true;
		}
		for (const image of document.querySelectorAll<HTMLImageElement>("#post-container .custom-md img, #post-cover img")) image.loading = "eager";
	});
	window.addEventListener("afterprint", restore);
	const print = async (button?: HTMLButtonElement) => {
		const article = document.querySelector("#post-container .markdown-content");
		if (!article || busy) return;
		busy = true;
		if (button) { button.disabled = true; button.textContent = "准备打印…"; }
		let timer = 0;
		try {
			const images = [...document.querySelectorAll<HTMLImageElement>("#post-container .custom-md img, #post-cover img")];
			for (const image of images) image.loading = "eager";
			await Promise.race([
				Promise.allSettled([document.fonts.ready, ...images.map(image => image.decode())]),
				new Promise(resolve => { timer = window.setTimeout(resolve, 8000); }),
			]);
			if (article.isConnected) window.print();
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
