import type { SearchResult } from "../global";

export type SearchArticle = {
	id: string;
	url: string;
	paths: string[];
	title?: string;
	description?: string;
	tags?: string[];
};

function pathname(value: string): string {
	const path = new URL(value, "https://search.local").pathname;
	try {
		return decodeURIComponent(path).replace(/\/+$/, "") || "/";
	} catch {
		return path.replace(/\/+$/, "") || "/";
	}
}

export function findSearchArticle(url: string, articles: SearchArticle[]): SearchArticle | undefined {
	const path = pathname(url);
	return articles.find(article => article.paths.some(candidate => pathname(candidate) === path));
}

export function escapeSearchHtml(value: string): string {
	return value.replace(/[&<>"']/g, character =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function searchTerms(keyword: string): string[] {
	const terms: string[] = keyword.trim().match(/"[^"]+"|\S+/g) ?? [];
	return terms
		.map(term => term.replace(/^"|"$/g, ""))
		.filter(Boolean);
}

export function matchesSearchText(text: string, keyword: string, matchCase = false): boolean {
	const normalized = text.replace(/\u200b/g, "");
	const haystack = matchCase ? normalized : normalized.toLocaleLowerCase();
	return searchTerms(keyword).every(term =>
		haystack.includes(matchCase ? term : term.toLocaleLowerCase()));
}

function searchPattern(keyword: string, matchCase: boolean): RegExp | undefined {
	const terms = [...new Set(searchTerms(keyword))].sort((a, b) => b.length - a.length);
	if (!terms.length) return undefined;
	return new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
		matchCase ? "gu" : "giu");
}

// Escape every segment before introducing our own mark elements; queries are literal text.
export function highlightSearchText(text: string, keyword: string, matchCase = false): string {
	const pattern = searchPattern(keyword, matchCase);
	if (!pattern) return escapeSearchHtml(text);
	let html = "";
	let offset = 0;
	for (const match of text.matchAll(pattern)) {
		const index = match.index!;
		html += escapeSearchHtml(text.slice(offset, index));
		html += `<mark class="search-match">${escapeSearchHtml(match[0])}</mark>`;
		offset = index + match[0].length;
	}
	return html + escapeSearchHtml(text.slice(offset));
}

export function matchingSearchExcerpt(text: string, keyword: string, matchCase = false): string {
	text = text.replace(/\u200b/g, "");
	const match = searchPattern(keyword, matchCase)?.exec(text);
	if (!match) return "";
	const start = Math.max(0, match.index - 60);
	const end = Math.min(text.length, match.index + match[0].length + 100);
	return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

// 按文章身份去重，不能按标题去重（不同文章可能同名）。兼容尚未更新的旧索引。
export function deduplicateSearchResults(
	results: SearchResult[],
	articles: SearchArticle[],
): SearchResult[] {
	const byPath = new Map(
		articles.flatMap((article) =>
			article.paths.map((path) => [pathname(path), article] as const),
		),
	);
	const seen = new Set<string>();
	return results.flatMap((result) => {
		const article = byPath.get(pathname(result.url));
		const key = article ? `article:${article.id}` : `url:${pathname(result.url)}`;
		if (seen.has(key)) return [];
		seen.add(key);
		return [{ ...result, url: article?.url || result.url }];
	});
}
