import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const base = process.argv[2] || "http://127.0.0.1:4321";
const managed = !process.argv[2];
let log = "";
const server = managed ? spawn(process.execPath, ["node_modules/astro/astro.js", "dev", "--host", "127.0.0.1", "--port", "4321"], {
	env: { ...process.env, ENABLE_CONTENT_SYNC: "false" }, stdio: ["ignore", "pipe", "pipe"],
}) : null;
for (const stream of [server?.stdout, server?.stderr]) stream?.on("data", chunk => { log = (log + chunk).slice(-20000); });
const run = script => new Promise((resolve, reject) => {
	const child = spawn(process.execPath, [script, base], { stdio: "inherit", env: process.env });
	child.on("error", reject);
	child.on("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${script}: ${signal || code}`)));
});
try {
	let ready = false;
	for (let attempt = 0; attempt < 90; attempt++) {
		if (server && server.exitCode !== null) throw new Error("Preview server exited");
		try {
			const response = await fetch(`${base}/src/components/comment/Giscus.svelte`, { signal: AbortSignal.timeout(2000) });
			await response.body?.cancel();
			if (response.ok) { ready = true; break; }
		} catch { /* Compilation may still be starting. */ }
		await delay(1000);
	}
	if (!ready) throw new Error("Preview server did not become ready");
	for (const script of ["scripts/test-comments-browser.mjs", "scripts/test-reading-experience.mjs", "scripts/test-article-tools.mjs"]) await run(script);
} catch (error) {
	console.error(log);
	console.error(error.message);
	process.exitCode = 1;
} finally {
	server?.kill();
}
