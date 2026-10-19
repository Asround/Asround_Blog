import { visit } from "unist-util-visit";

const text = node => node.type === "text" ? node.value : (node.children || []).map(text).join("");
const normalize = value => String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
export function rehypePrintTitle() {
	return (tree, file) => {
		let first = true;
		visit(tree, "element", node => {
			if (!first || !/^h[1-6]$/.test(node.tagName)) return;
			first = false;
			if (normalize(text(node)) === normalize(file.data.astro?.frontmatter?.title)) {
				node.properties ||= {};
				node.properties.className = [...(node.properties.className || []), "print-duplicate-title"];
			}
		});
	};
}
