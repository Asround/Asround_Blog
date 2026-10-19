import assert from "node:assert/strict";
import test from "node:test";
import { articleImageOptions } from "../src/plugins/rehype-article-images.mjs";
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
