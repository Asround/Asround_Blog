import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { importTS } from "./check-content.mjs";

const { hasMixedPhotoRatios } = await importTS(await readFile("src/utils/album-layout.ts", "utf8"));

test("等比例的不同分辨率和导出舍入误差仍使用末行居中的布局", () => {
	assert.equal(hasMixedPhotoRatios([{ width: 3840, height: 2160 }, { width: 1920, height: 1080 }, { width: 2560, height: 1439 }]), false);
});

test("横竖混合、方形与横幅混合、不同横幅比例均使用瀑布流", () => {
	for (const dimensions of [[[3132, 5568], [5568, 3132]], [[1000, 1000], [1920, 1080]], [[1600, 900], [1600, 1000]]]) {
		assert.equal(hasMixedPhotoRatios(dimensions.map(([width, height]) => ({ width, height }))), true);
	}
});

test("空相册、单图和无有效尺寸的外链相册保留原布局，不被错误识别为混合比例", () => {
	for (const photos of [[], [{ width: 100, height: 100 }], [{}, { width: 0, height: 100 }, { width: NaN, height: 100 }, { width: 100, height: Infinity }]]) {
		assert.equal(hasMixedPhotoRatios(photos), false);
	}
});
