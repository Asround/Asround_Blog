import assert from "node:assert/strict";
import test from "node:test";
import { articleImageOptions } from "../src/plugins/rehype-article-images.mjs";
import service from "../src/utils/article-image-service.mjs";
import sharp from "sharp";
import sharpService from "astro/assets/services/sharp";
test("正文图表使用无损 PNG，照片使用多尺寸 WebP，全部不放大源图", () => {
	for (const format of ["png", "jpeg", "webp"]) {
		const options = articleImageOptions({ format, width: 4000, height: 3000 });
		assert.equal(options.width, 1280);
		assert.equal(options.format, format === "png" ? "png" : "webp");
		assert.ok(options.widths.every(width => width <= 2560));
	}
	assert.deepEqual(articleImageOptions({ format: "png", width: 300, height: 200 }).widths, [300]);
	assert.equal(articleImageOptions({ format: "jpeg", width: 4000, height: 2000, orientation: 6 }).widths.at(-1), 2000);
	assert.equal(articleImageOptions({ format: "gif", width: 1000, height: 600 }), undefined);
	assert.equal(articleImageOptions({ format: "webp", width: 1000, height: 600, pages: 2 }), undefined);
});

test("原图输出逐字节保留且缓存键与缩图分离，开发 URL 保留原图标记", async () => {
	const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } }).png().toBuffer();
	const original = await service.transform(bytes, { format: "png", asroundOriginal: true }, {});
	assert.equal(original.data, bytes);
	assert.equal(original.format, "png");
	assert.ok(service.propertiesToHash.includes("asroundOriginal"));
	const resized = await service.transform(bytes, { format: "png", width: 6 }, { service: { config: {} } });
	assert.equal((await sharp(resized.data).metadata()).width, 6);
	const baseURL = sharpService.getURL;
	try {
		sharpService.getURL = () => "/_image?href=%2Fsource.png&w=12&f=png";
		const url = await service.getURL({ asroundOriginal: true }, {});
		const parsed = await service.parseURL(new URL(url, "https://example.org"), {});
		assert.equal(parsed.asroundOriginal, true);
		assert.equal(parsed.src, "/source.png");
		assert.equal((await service.parseURL(new URL(await service.getURL({}, {}), "https://example.org"), {})).asroundOriginal, undefined);
	} finally { sharpService.getURL = baseURL; }
});
