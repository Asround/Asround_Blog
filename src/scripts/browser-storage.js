// Runs before theme/layout initialization. Failed writes remain usable in this tab;
// never replace the browser's Storage APIs or interfere with third-party sessions.
(() => {
	if (window.asroundStorage) return;
	const create = (name) => {
		const fallback = new Map();
		return {
			getItem(key) {
				if (fallback.has(key)) return fallback.get(key);
				try { return window[name].getItem(key); } catch { return null; }
			},
			setItem(key, value) {
				value = String(value);
				try { window[name].setItem(key, value); fallback.delete(key); }
				catch { fallback.set(key, value); }
			},
		};
	};
	window.asroundStorage = { local: create("localStorage"), session: create("sessionStorage") };
})();
