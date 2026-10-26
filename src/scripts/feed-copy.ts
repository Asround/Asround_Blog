import { copyText } from "../utils/clipboard";
import { runOnce } from "../utils/page-view";

runOnce("feed-copy", () => {
	document.addEventListener("click", async event => {
		const button = event.target instanceof Element
			? event.target.closest<HTMLButtonElement>("#copy-rss-btn, #copy-atom-btn") : null;
		if (!button?.dataset.url || button.disabled) return;
		const text = button.textContent;
		const background = button.style.backgroundColor;
		button.disabled = true;
		try {
			await copyText(button.dataset.url);
			button.textContent = `${button.id === "copy-rss-btn" ? "RSS" : "Atom"} link copied to clipboard!`;
			if (button.id === "copy-rss-btn") button.style.backgroundColor = "var(--success-color, #10b981)";
		} catch {
			button.textContent = "Copy failed, please copy the link manually";
		} finally {
			setTimeout(() => { button.textContent = text; button.style.backgroundColor = background; button.disabled = false; }, 2000);
		}
	});
});
