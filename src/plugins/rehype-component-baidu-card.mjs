import { h } from "hastscript";

/** Render a reusable Baidu download card from a leaf directive. */
export function BaiduCardComponent(properties, children) {
	if (children?.length) throw new Error("Baidu cards require leaf directives.");
	const url = new URL(properties.url);
	if (url.protocol !== "https:" || url.hostname !== "pan.baidu.com")
		throw new Error("Baidu cards require an HTTPS pan.baidu.com URL.");
	const code = String(properties.code || url.searchParams.get("pwd") || "");
	if (code) url.searchParams.set("pwd", code);
	return h("section", { class: "card-baidu not-prose", "aria-label": "百度网盘资料下载" }, [
		h("div", { class: "bd-header" }, [
			h("span", { class: "bd-icon", "aria-hidden": "true" }, [
				h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7" }, [
					h("path", { d: "M7 17H6a4 4 0 0 1-.4-8A6.5 6.5 0 0 1 18 7.5a4.8 4.8 0 0 1 0 9.5h-1" }),
					h("path", { d: "M12 11v10m-4-4 4 4 4-4" }),
				]),
			]),
			h("div", { class: "bd-heading" }, [
				h("div", { class: "bd-provider" }, "百度网盘 · 资料下载"),
				h("div", { class: "bd-title" }, properties.title || "课程资料"),
			]),
		]),
		...(properties.description ? [h("div", { class: "bd-description" }, properties.description)] : []),
		h("div", { class: "bd-actions" }, [
			...(code ? [h("div", { class: "bd-code" }, [
				h("span", {}, "提取码"),
				h("span", { class: "bd-code-value" }, code),
				h("button", { type: "button", class: "bd-copy", "data-baidu-code": code, "aria-label": "复制提取码", "aria-live": "polite" }, "复制"),
			])] : []),
			h("a", { class: "bd-open no-styling", href: url.href, target: "_blank", rel: "noopener noreferrer", "data-swup-ignore": true }, [
				"打开百度网盘", h("span", { "aria-hidden": "true" }, "↗"),
			]),
		]),
	]);
}
