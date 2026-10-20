import type { Photo } from "../types/album";

/** 容许缩放或导出带来的微小舍入误差；尺寸未知时保留原来的按行布局。 */
export function hasMixedPhotoRatios(photos: Photo[]): boolean {
	const ratios = photos.flatMap(({ width, height }) =>
		typeof width === "number" && typeof height === "number"
		&& Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
			? [width / height] : []);
	if (ratios.length < 2) return false;
	return Math.max(...ratios) / Math.min(...ratios) - 1 > 0.005;
}
