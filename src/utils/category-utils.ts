import { frontendConfig } from "../config";

// 仅转换显示名称，保留 frontmatter 分类值和既有筛选链接。
export function getCategoryLabel(category: string): string {
	return frontendConfig.categoryLabels[category.trim()] || category.trim();
}
