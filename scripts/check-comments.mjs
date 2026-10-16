import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { access } from "node:fs/promises";
import ts from "typescript";
import { importTS } from "./check-content.mjs";

const { giscusConfigurationErrors } = await importTS(await readFile(new URL("../src/utils/comment-utils.ts", import.meta.url), "utf8"));

export async function readCommentConfig() {
	const source = await readFile(new URL("../src/config.ts", import.meta.url), "utf8");
	const tree = ts.createSourceFile("config.ts", source, ts.ScriptTarget.Latest, true);
	const declarations = tree.statements.filter(ts.isVariableStatement).flatMap((statement) => [...statement.declarationList.declarations]);
	const literal = (name) => declarations.find((entry) => entry.name.getText(tree) === name)?.initializer?.getText(tree);
	if (!literal("commentConfig") || !literal("SITE_LANG")) throw new Error("缺少 commentConfig 或 SITE_LANG 配置");
	return (await importTS(`const SITE_LANG = ${literal("SITE_LANG")}; export default ${literal("commentConfig")};`)).default;
}

export function checkCommentConfig(config) {
	if (!config.enable) return { errors: [], message: "评论保持关闭：网站接入已准备，待仓库授权和公开 ID 配置后启用。" };
	if ((config.provider ?? "twikoo") === "giscus") return {
		errors: giscusConfigurationErrors(config.giscus), message: "giscus 配置字段检查完成（不代表远端授权已验收）。",
	};
	return { errors: config.twikoo?.envId.trim() ? [] : ["Twikoo 缺少 envId"], message: "使用旧版 Twikoo 配置。" };
}

async function readSiteURL() {
	const source = await readFile(new URL("../src/config.ts", import.meta.url), "utf8");
	const tree = ts.createSourceFile("config.ts", source, ts.ScriptTarget.Latest, true);
	const declaration = tree.statements.filter(ts.isVariableStatement).flatMap((statement) => [...statement.declarationList.declarations])
		.find((entry) => entry.name.getText(tree) === "siteConfig");
	const entry = declaration?.initializer?.properties?.find((item) => item.name?.getText(tree) === "siteURL");
	if (!entry?.initializer || !ts.isStringLiteral(entry.initializer)) throw new Error("siteConfig.siteURL 需要为明确的站点地址");
	return entry.initializer.text;
}

export async function checkLocalStylesheet(config) {
	const stylesheet = config.giscus?.themeStylesheet;
	if (!config.enable || config.provider !== "giscus" || !stylesheet?.startsWith("/") || stylesheet.startsWith("//")) return;
	const pathname = new URL(stylesheet, "https://blog.invalid").pathname;
	const target = new URL("../public/" + pathname.slice(1), import.meta.url);
	await access(target).catch(() => { throw new Error(`缺少评论增强样式 public${pathname}`); });
	const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
	const rule = headers.split(/\r?\n\s*\r?\n/).find((block) => block.split(/\r?\n/, 1)[0].trim() === pathname);
	if (!rule || !/Access-Control-Allow-Origin:\s*\*/i.test(rule)) throw new Error(`${pathname} 缺少供跨域评论 iframe 使用的 CORS 响应头`);
}

export async function checkRemoteComments(config, siteURL, fetcher = fetch) {
	if (!config.enable || config.provider !== "giscus") return "评论未使用 giscus，跳过远端检查。";
	const { repo, repoId, category, categoryId } = config.giscus;
	const urls = [
		`https://api.github.com/repos/${repo}`,
		`https://giscus.app/api/discussions/categories?${new URLSearchParams({ repo })}`,
		`https://raw.githubusercontent.com/${repo}/HEAD/giscus.json`,
	];
	const values = await Promise.all(urls.map(async (url) => {
		const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
		return response.json();
	}));
	const [repository, setup, origins] = values;
	if (repository.private || !repository.has_discussions) throw new Error("评论仓库必须公开并开启 Discussions");
	if (repository.node_id !== repoId || setup.repositoryId !== repoId) throw new Error("仓库公开 ID 与 GitHub/giscus 返回值不符");
	if (!setup.categories?.some((item) => item.id === categoryId && item.name === category)) throw new Error("giscus 无法访问指定分类，请检查分类名称、ID 和应用授权");
	for (const origin of [new URL(siteURL).origin, "http://localhost:4321"]) {
		const allowed = origins.origins?.includes(origin) || origins.originsRegex?.some((pattern) => new RegExp(pattern).test(origin));
		if (!allowed) throw new Error(`giscus.json 未允许 ${origin}`);
	}
	return "远端检查通过：公开仓库、Discussions、giscus 应用分类访问、真实 ID、正式与本地 origin。";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (process.argv.slice(2).some((arg) => arg !== "--remote")) throw new Error("用法：pnpm check:comments [--remote]");
		const config = await readCommentConfig();
		const result = checkCommentConfig(config);
		console.log(result.message);
		for (const error of result.errors) console.error(`ERROR ${error}`);
		if (result.errors.length) process.exitCode = 1;
		else {
			await checkLocalStylesheet(config);
			if (process.argv.includes("--remote")) console.log(await checkRemoteComments(config, await readSiteURL()));
		}
	} catch (error) { console.error(error.message); process.exitCode = 1; }
}
