import type { CommentConfig, GiscusConfig } from "../types/config";

/** 使用正式路径而非当前浏览器地址，旧入口、域名和查询参数不会拆分讨论。 */
export function getCommentTerm(canonicalPath: string, commentId?: string): string {
	if (commentId?.trim()) return commentId.trim();
	const path = decodeURIComponent(canonicalPath.split(/[?#]/, 1)[0]);
	const clean = path.replace(/^\/+|\/+$/g, "");
	return clean ? `/${clean}/` : "/";
}

export function giscusConfigurationErrors(config?: GiscusConfig): string[] {
	if (!config) return ["缺少 giscus 配置"];
	const errors: string[] = [];
	if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) errors.push("repo 应为 owner/repo");
	if (!/^(?:R_[\w-]+|MDEwOlJlcG9zaXRvcnk[A-Za-z0-9+/=]+)$/.test(config.repoId)) errors.push("缺少有效的仓库公开 ID repoId");
	if (!config.category.trim()) errors.push("缺少讨论分类名称 category");
	if (!/^(?:DIC_[\w-]+|MDE4OkRpc2N1c3Npb25DYXRlZ29yeT[A-Za-z0-9+/=]+)$/.test(config.categoryId)) errors.push("缺少有效的分类公开 ID categoryId");
	if (config.themeStylesheet) {
		try {
			const url = new URL(config.themeStylesheet, "https://blog.invalid");
			if (url.protocol !== "https:" || url.username || url.password) throw new Error();
		} catch { errors.push("themeStylesheet 应为站内路径或不含凭据的 HTTPS CSS 地址"); }
	}
	return errors;
}

export function shouldShowComments(
	config: CommentConfig,
	post: { comment?: boolean; draft?: boolean; encrypted?: boolean },
): boolean {
	if (!config.enable || post.comment === false || post.draft || post.encrypted) return false;
	return (config.provider ?? "twikoo") === "giscus"
		? giscusConfigurationErrors(config.giscus).length === 0
		: Boolean(config.twikoo?.envId.trim());
}

export function getDiscussionListUrl(config: GiscusConfig): string {
	return `https://github.com/${config.repo}/discussions`;
}

export function getGiscusStylesheetUrl(config: GiscusConfig, siteURL: string): string | undefined {
	return config.themeStylesheet ? new URL(config.themeStylesheet, siteURL).href : undefined;
}
