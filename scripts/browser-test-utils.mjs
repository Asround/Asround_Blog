import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Existing .git is deliberately used: no new artifact directory or tracked screenshots.
export function browserEvidence(context, suite) {
	const errors = [], steps = [];
	const safe = value => value.replace(/[^a-z0-9-]/gi, "-");
	const prefix = `.git/prove-it-${safe(suite)}`;
	context.on("page", page => {
		page.on("pageerror", error => errors.push(`exception: ${error.message}`));
		page.on("console", message => {
			if (message.type() === "error") errors.push(`console: ${message.text()} (${message.location().url})`);
		});
	});
	return {
		async step(page, name, action) {
			const start = errors.length;
			const screenshot = `${prefix}-${safe(name)}.png`;
			let failure;
			try { await action(); assert.deepEqual(errors.slice(start), [], `${suite}/${name}: browser errors`); }
			catch (error) { failure = error; }
			try { await page.screenshot({ path: screenshot }); }
			catch (error) { failure ??= error; }
			steps.push({ name, passed: !failure, screenshot, ...(failure ? { error: failure.message } : {}) });
			await writeFile(`${prefix}.json`, JSON.stringify({ steps }, null, 2));
			if (failure) throw failure;
			console.log(`PASS ${suite}/${name}`);
		},
		assertNoErrors() { assert.deepEqual(errors, [], `${suite}: browser errors`); },
	};
}

// Only unrelated services are isolated. Never replace the UI/algorithm under test.
export async function isolateExternalServices(context) {
	await context.route(/https:\/\/(?:www\.clarity\.ms|www\.googletagmanager\.com|giscus\.app)\//,
		route => route.fulfill({ contentType: "application/javascript", body: "" }));
	await context.route(url => url.searchParams.get("type") === "playlist" && url.searchParams.has("server"),
		route => route.fulfill({ contentType: "application/json", body: "[]" }));
	const require = createRequire(import.meta.url);
	const icons = JSON.parse(await readFile(require.resolve("@iconify-json/material-symbols/icons.json"), "utf8"));
	await context.route(/https:\/\/api\.(?:iconify\.design|simplesvg\.com|unisvg\.com)\/material-symbols\.json\?/, route => {
		const names = new URL(route.request().url()).searchParams.get("icons")?.split(",") || [];
		return route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({
			prefix: icons.prefix, width: icons.width, height: icons.height,
			icons: Object.fromEntries(names.filter(name => icons.icons[name]).map(name => [name, icons.icons[name]])),
			aliases: icons.aliases || {}, not_found: names.filter(name => !icons.icons[name] && !icons.aliases?.[name]),
		}) });
	});
}
