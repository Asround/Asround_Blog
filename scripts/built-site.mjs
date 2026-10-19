import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";

// Serve an existing build on an ephemeral loopback port. Never builds or writes files.
export async function withBuiltSite(task, directory = "dist") {
	const root = path.resolve(directory);
	await stat(path.join(root, "index.html"));
	const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".woff2": "font/woff2", ".xml": "application/xml" };
	const server = http.createServer(async (request, response) => {
		try {
			if (!["GET", "HEAD"].includes(request.method)) { response.writeHead(405).end(); return; }
			const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
			if (/[\\\u0000-\u001f]/.test(pathname) || pathname.split("/").some(part => part.startsWith("."))) { response.writeHead(403).end(); return; }
			let file = path.resolve(root, "." + pathname);
			if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
			if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
			const bytes = await readFile(file);
			const cache = /^\/(?:_astro|assets|pagefind)\//.test(pathname) ? "public, max-age=3600" : "no-cache";
			response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "content-length": bytes.length, "cache-control": cache });
			response.end(request.method === "HEAD" ? undefined : bytes);
		} catch (error) { response.writeHead(["ENOENT", "ENOTDIR"].includes(error.code) ? 404 : 400).end(); }
	});
	await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
	try { return await task(`http://127.0.0.1:${server.address().port}`); }
	finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
