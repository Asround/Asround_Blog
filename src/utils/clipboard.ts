export async function copyText(value: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		try { await navigator.clipboard.writeText(value); return; }
		catch { /* Browser permissions can reject the async API; try the selection fallback. */ }
	}
	const previous = document.activeElement as HTMLElement | null;
	const input = document.createElement("textarea");
	input.value = value;
	input.style.cssText = "position:fixed;left:-9999px";
	(document.querySelector("dialog[open]") || document.body).append(input);
	try {
		input.select();
		if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
	} finally {
		input.remove();
		previous?.focus({ preventScroll: true });
	}
}
