import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import { parse as parseHTML } from "node-html-parser";

export const projectRoot = fileURLToPath(new URL("../", import.meta.url));
// 从 Astro 自身的依赖解析 Markdown/YAML，沿用项目安装的解析器，不增加依赖。
const astroRequire = createRequire(import.meta.resolve("astro/package.json"));
const markdownRequire = createRequire(astroRequire.resolve("@astrojs/markdown-remark"));
const { load: loadYAML } = astroRequire("js-yaml");
const { unified } = await import(pathToFileURL(markdownRequire.resolve("unified")).href);
const { default: remarkParse } = await import(pathToFileURL(markdownRequire.resolve("remark-parse")).href);
const { slug } = await import(pathToFileURL(astroRequire.resolve("github-slugger")).href);
const parser = unified().use(remarkParse).use(remarkMath).use(remarkDirective);

async function importTS(source) {
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const schemaSource = await readFile(new URL("../src/content-schema.ts", import.meta.url), "utf8");
const { postSchema } = await importTS(schemaSource.replace(
	/(["'])astro\/zod\1/g, JSON.stringify(import.meta.resolve("astro/zod")),
));

export async function readPermalinkConfig(root = projectRoot) {
	const source = await readFile(path.join(root, "src/config.ts"), "utf8");
	const tree = ts.createSourceFile("config.ts", source, ts.ScriptTarget.Latest, true);
	for (const statement of tree.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		const entry = statement.declarationList.declarations.find((item) => item.name.getText(tree) === "permalinkConfig");
		if (entry?.initializer) {
			// 只执行该配置的字面量，不加载站点组件或启动 Vite。
			return (await importTS(`export default ${entry.initializer.getText(tree)}`)).default;
		}
	}
	throw new Error("src/config.ts 中缺少 permalinkConfig，无法可靠检查文章地址。");
}

export async function listFiles(directory, base = directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const groups = await Promise.all(entries.map(async (entry) => {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) return listFiles(target, base);
		return entry.isFile() ? [path.relative(base, target).split(path.sep).join("/")] : [];
	}));
	return groups.flat().sort();
}

export async function readDocuments(root = projectRoot) {
	const directory = path.join(root, "src/content/posts");
	const files = (await listFiles(directory)).filter((file) => file.endsWith(".md"));
	return Promise.all(files.map(async (file) => ({
		file: `src/content/posts/${file}`,
		source: await readFile(path.join(directory, file), "utf8"),
	})));
}

export async function readStaticRoutes(root = projectRoot) {
	return (await listFiles(path.join(root, "src/pages")))
		.filter((file) => !file.includes("[") && /\.(astro|[cm]?[jt]s)$/.test(file))
		.map((file) => "/" + file.replace(/\.(astro|[cm]?[jt]s)$/, "").replace(/(^|\/)index$/, ""))
		.map((route) => /\.[a-z]+$/i.test(route) ? route : route.replace(/\/$/, "") + "/");
}

function walk(node, visit) {
	visit(node);
	for (const child of node.children || []) walk(child, visit);
}

function plainText(node) {
	return node.value ?? (node.children || []).map(plainText).join("");
}

function canonicalRoute(value) {
	return "/" + value.replace(/^\/+|\/+$/g, "") + "/";
}

function routeKey(value) {
	return decodeURIComponent(value).replace(/\/+$/, "") || "/";
}

function checkSegment(value) {
	try {
		const decoded = decodeURIComponent(value.replace(/^\/+|\/+$/g, ""));
		return !!decoded && decoded !== "." && decoded !== ".." && !/[\s/\\?#\u0000-\u001f]/.test(decoded);
	} catch { return false; }
}

function localTarget(value, file, root) {
	if (/^(?:[a-z]:[\\/]|file:)/i.test(value) || value.includes("\\")) {
		return { error: "使用了本机绝对路径或反斜杠，部署后不可用" };
	}
	if (/^(?:https?:|data:|\/\/)/i.test(value)) return { external: true };
	if (/^[a-z][a-z\d+.-]*:/i.test(value)) return { error: "不支持的资源协议" };
	let clean;
	try { clean = decodeURIComponent(value.split(/[?#]/, 1)[0]); }
	catch { return { error: "路径包含无效的 URL 编码" }; }
	if (/[\\\u0000-\u001f]/.test(clean)) return { error: "路径包含编码后的反斜杠或控制字符" };
	if (!clean) return { external: true };
	const absolute = clean.startsWith("/")
		? path.resolve(root, "public", "." + clean)
		: path.resolve(root, path.dirname(file), clean);
	const relative = path.relative(root, absolute);
	if (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) {
		return { error: "路径超出项目目录" };
	}
	if (clean.startsWith("/") && !absolute.startsWith(path.join(root, "public") + path.sep)) {
		return { error: "公开资源路径超出 public 目录" };
	}
	return { absolute, clean };
}

export function createFileInspector() {
	const directories = new Map();
	return async (target) => {
		const { root } = path.parse(target);
		let current = root;
		for (const segment of path.relative(root, target).split(path.sep)) {
			if (!directories.has(current)) {
				directories.set(current, readdir(current).catch((error) => {
					if (["ENOENT", "ENOTDIR"].includes(error.code)) return [];
					throw error;
				}));
			}
			const names = await directories.get(current);
			if (!names.includes(segment)) {
				return names.some((name) => name.toLowerCase() === segment.toLowerCase()) ? "case" : "missing";
			}
			current = path.join(current, segment);
		}
		return (await stat(target)).isFile() ? "ok" : "directory";
	};
}

export async function auditContent({ documents, root = projectRoot, permalink = { enable: false },
	staticRoutes = [], inspectFile = createFileInspector() }) {
	const issues = [];
	const articles = [];
	const resourceCache = new Map();
	const ids = new Map();
	const staticKeys = new Set(staticRoutes.map(routeKey));
	const routes = new Map([...staticKeys].map((route) => [route, "src/pages"]));
	const add = (level, code, file, line, message) => issues.push({ level, code, file, line, message });
	for (const document of documents) {
		const { file } = document;
		const source = document.source.replace(/^\uFEFF/, "");
		const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source);
		if (!frontmatter) {
			add("error", "frontmatter", file, 1, "缺少完整的 YAML frontmatter");
			continue;
		}
		let raw;
		try { raw = loadYAML(frontmatter[1]); }
		catch (error) {
			add("error", "yaml", file, (error.mark?.line ?? 0) + 2, error.reason || error.message);
			continue;
		}
		const checked = postSchema.safeParse(raw);
		if (!checked.success) {
			for (const issue of checked.error.issues) {
				add("error", "metadata", file, 2, `${issue.path.join(".") || "frontmatter"}: ${issue.message}`);
			}
			continue;
		}
		const data = checked.data;
		if (data.encrypted && !data.password.trim()) add("error", "encryption-password", file, 2, "标记为加密的文章缺少密码，当前文章模板会回退为公开正文");
		if (!data.title.trim()) add("error", "title", file, 2, "标题不能为空白");
		for (const match of frontmatter[1].matchAll(/^(published|updated):[ \t]*(\d{4}-\d{2}-\d{2})(?=[T \t#]|$)/gm)) {
			const date = new Date(match[2] + "T00:00:00Z");
			if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[2]) {
				add("error", "date", file, 2, `${match[1]}: ${match[2]} 不是有效的日历日期`);
			}
		}
		if (data.updated && data.updated < data.published) add("warning", "updated", file, 2, "更新日期早于发布日期");
		if (!data.description.trim()) add("warning", "description", file, 2, "缺少简介，搜索摘要和分享说明会回退到其他内容");
		const relative = file.replace(/^src\/content\/posts\//, "").replace(/\.md$/, "");
		const id = raw.slug || relative.split("/").map((part) => slug(part)).join("/").replace(/\/index$/, "");
		if (typeof id !== "string" || !id.trim()) {
			add("error", "id", file, 2, "文章 slug 必须是非空字符串");
			continue;
		}
		if (!id.split("/").every(checkSegment)) add("error", "id", file, 2, "文章 ID 包含无效路径段");
		if (ids.has(id)) add("error", "duplicate-id", file, 2, `文章 ID ${id} 与 ${ids.get(id)} 重复，会覆盖内容`);
		ids.set(id, file);
		const body = source.slice(frontmatter[0].length);
		const offset = frontmatter[0].split("\n").length - 1;
		const tree = parser.parse(body);
		articles.push({ file, id, data, tree, offset });
	}
	const numericIds = new Map([...articles].filter((post) => !post.data.draft)
		.sort((a, b) => a.data.published - b.data.published).map((post, index) => [post.id, index + 1]));
	for (const article of articles) {
		const { file, id, data, tree, offset } = article;
		const warnOnce = new Set();
		const warn = (code, line, message) => {
			if (!warnOnce.has(code)) add("warning", code, file, line, message);
			warnOnce.add(code);
		};
		let route = `/posts/${id}/`;
		const aliases = [route];
		if (data.permalink || permalink.enable) {
			const date = data.published;
			const values = { year: date.getFullYear(), monthnum: String(date.getMonth() + 1).padStart(2, "0"),
				day: String(date.getDate()).padStart(2, "0"), hour: String(date.getHours()).padStart(2, "0"),
				minute: String(date.getMinutes()).padStart(2, "0"), second: String(date.getSeconds()).padStart(2, "0"),
				post_id: numericIds.get(id) ?? 0, postname: id, category: data.category || "uncategorized" };
			const value = data.permalink || permalink.format.replace(/\//g, "-").replace(/%([a-z_]+)%/g, (token, key) => values[key] ?? token);
			if (!checkSegment(value)) add("error", "permalink", file, 2, "根级 permalink 必须是单个有效路径段，不能含斜杠、空格或查询参数");
			route = canonicalRoute(value);
			aliases.push(route);
		} else if (data.alias) {
			if (!data.alias.replace(/^\/+|\/+$/g, "").split("/").every(checkSegment)) add("error", "alias", file, 2, "alias 包含无效路径段");
			if (!data.alias.replace(/^\/+/, "").startsWith("posts/")) {
				route = canonicalRoute("posts/" + data.alias.replace(/^\/+|\/+$/g, ""));
				aliases.push(route);
			} else add("error", "alias", file, 2, "alias 不应包含 posts/ 前缀，否则文章入口与生成地址不一致");
		}
		article.url = route;
		article.paths = [...new Set(aliases)];
		for (const url of article.paths) {
			let key;
			try { key = routeKey(url); }
			catch { add("error", "route", file, 2, `无效的文章地址: ${url}`); continue; }
			if (routes.has(key) && routes.get(key) !== file) add("error", "route-collision", file, 2, `${url} 与 ${routes.get(key)} 的地址冲突`);
			routes.set(key, file);
		}
		async function resource(value, line, kind) {
			const resolved = localTarget(value, file, root);
			if (resolved.external) return;
			if (kind === "attachment" && !resolved.error && !resolved.clean.startsWith("/")) warn("relative-attachment", line, "相对附件链接不会像 Markdown 图片一样自动打包，需确认发布后的下载地址");
			if (resolved.error) { add("error", "resource-path", file, line, `${value}: ${resolved.error}`); return; }
			if (!resourceCache.has(resolved.absolute)) resourceCache.set(resolved.absolute, inspectFile(resolved.absolute));
			const status = await resourceCache.get(resolved.absolute);
			if (status !== "ok") add("error", "resource-" + status, file, line, `${value}: ${
				status === "case" ? "文件名大小写不一致，Linux 部署会失败" : status === "directory" ? "目标是目录，不能用作文件" : "本地文件不存在"}`);
			if (kind === "image" && !resolved.clean.startsWith("/") && !resolved.clean.replace(/^\.\//, "").startsWith("index.assets/")) {
				warn("legacy-assets", line, "正文图片使用旧资源目录；后续迁移统一到 index.assets，当前不自动搬动");
			}
			if (kind === "cover" && path.dirname(resolved.absolute) !== path.resolve(root, path.dirname(file))) {
				warn("cover-location", line, "封面未放在文章 Markdown 同级，后续迁移时整理");
			}
		}
		if (data.image) await resource(data.image, 2, "cover");
		const definitions = new Map();
		walk(tree, (node) => { if (node.type === "definition") definitions.set(node.identifier, node.url); });
		const tasks = [];
		let previousHeading = 0;
		walk(tree, (node) => {
			const line = (node.position?.start.line || 1) + offset;
			if (node.type === "heading") {
				if (previousHeading && node.depth > previousHeading + 1) warn("heading-skip", line, `标题从 H${previousHeading} 跳到 H${node.depth}: ${plainText(node)}`);
				previousHeading = node.depth;
			}
			if (node.type === "image" || node.type === "imageReference") {
				const value = node.url ?? definitions.get(node.identifier);
				if (value) tasks.push(resource(value, line, "image"));
			}
			if (node.type === "link" || node.type === "linkReference") {
				const value = node.url ?? definitions.get(node.identifier);
				// 仅检查实际文件附件，不把文章路由、锚点或邮件地址误判为文件。
				let isPage = false;
				try { isPage = value?.startsWith("/") && staticKeys.has(routeKey(value.split(/[?#]/, 1)[0])); } catch { /* 交给资源路径检查报告无效编码。 */ }
				if (value && !isPage && /\.[a-z\d]{1,10}(?:[?#]|$)/i.test(value) && !/^(?:https?:|\/\/|mailto:)/i.test(value)) tasks.push(resource(value, line, "attachment"));
			}
			if (node.type === "html") {
				for (const image of parseHTML(node.value).querySelectorAll("img[src]")) {
					const src = image.getAttribute("src");
					if (!/^(?:https?:|data:|\/\/|\/)/i.test(src)) add("error", "html-image", file, line, `${src}: 原生 HTML 相对图片路径不会经 Astro 资源解析，请使用 Markdown 图片`);
					tasks.push(resource(src, line, "image"));
				}
			}
			if (node.type === "leafDirective" && node.name === "baidu") {
				try {
					const url = new URL(node.attributes?.url);
					if (url.protocol !== "https:" || url.hostname !== "pan.baidu.com") throw new Error();
					const code = node.attributes?.code;
					if (code && url.searchParams.get("pwd") && code !== url.searchParams.get("pwd")) add("error", "baidu-code", file, line, "百度网盘 URL 的 pwd 与卡片 code 不一致");
				} catch { add("error", "baidu-url", file, line, "百度卡片必须使用有效的 https://pan.baidu.com 分享地址"); }
			}
			if (node.type === "leafDirective" && node.name === "github" && !/^[\w.-]+\/[\w.-]+$/.test(node.attributes?.repo || "")) add("error", "github-repo", file, line, "GitHub 卡片 repo 应为 owner/repo");
		});
		await Promise.all(tasks);
	}
	issues.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
	return { articles, issues, resourceCount: resourceCache.size };
}

export async function auditProject(root = projectRoot) {
	const [documents, permalink, staticRoutes] = await Promise.all([
		readDocuments(root), readPermalinkConfig(root), readStaticRoutes(root),
	]);
	return auditContent({ documents, permalink, staticRoutes, root });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		if (process.argv.slice(2).some((arg) => !["--json", "--strict", "--help"].includes(arg))) throw new Error("未知参数，使用 --help 查看用法");
		if (process.argv.includes("--help")) {
			console.log("pnpm check:content [--json] [--strict]\n只读检查全部文章，不启动服务、不构建、不联网、不改写内容。\n默认仅错误导致退出码 1；--strict 也将整理建议视为失败。");
		} else {
			const result = await auditProject();
			const errors = result.issues.filter((issue) => issue.level === "error").length;
			const warnings = result.issues.length - errors;
			if (process.argv.includes("--json")) console.log(JSON.stringify({
				articleCount: result.articles.length, resourceCount: result.resourceCount, errors, warnings, issues: result.issues,
			}, null, 2));
			else {
				for (const issue of result.issues) console.log(`${issue.level === "error" ? "ERROR" : "WARN"} ${issue.file}:${issue.line} [${issue.code}] ${issue.message}`);
				console.log(`检查 ${result.articles.length} 篇文章、${result.resourceCount} 个本地资源：${errors} 个错误，${warnings} 条整理建议。`);
			}
			if (errors || (warnings && process.argv.includes("--strict"))) process.exitCode = 1;
		}
	} catch (error) {
		console.error(`内容检查未完成: ${error.message}`);
		process.exitCode = 1;
	}
}
