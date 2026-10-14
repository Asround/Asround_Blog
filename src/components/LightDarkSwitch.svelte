<script lang="ts">
import { DARK_MODE, LIGHT_MODE, DEFAULT_THEME } from "@constants/constants";
import Icon from "@iconify/svelte";
import { getCurrentTheme, getStoredTheme, setTheme } from "@utils/setting-utils";
import type { LIGHT_DARK_MODE } from "@/types/config.ts";
import { onMount } from "svelte";

let mode: LIGHT_DARK_MODE = $state(DEFAULT_THEME);

onMount(() => {
    mode = getStoredTheme();
    // 与常驻阅读侧栏同步，避免另一入口切换后按钮状态滞后。
    const syncTheme = () => {
        mode = document.documentElement.classList.contains('dark') ? DARK_MODE : LIGHT_MODE;
    };
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
});

function toggleScheme(event: MouseEvent) {
	setTheme(getCurrentTheme() === DARK_MODE ? LIGHT_MODE : DARK_MODE, event);
}

// 添加Swup钩子监听，确保在页面切换后同步主题状态
if (typeof window !== "undefined") {
	// 监听Swup的内容替换事件
	const handleContentReplace = () => {
		// 使用requestAnimationFrame确保在下一帧更新状态，避免渲染冲突
		requestAnimationFrame(() => {
			const newMode = getStoredTheme();
			if (mode !== newMode) {
				mode = newMode;
			}
		});
	};

	// 检查Swup是否已经加载
	if ((window as any).swup && (window as any).swup.hooks) {
		(window as any).swup.hooks.on("content:replace", handleContentReplace);
	} else {
		document.addEventListener("swup:enable", () => {
			if ((window as any).swup && (window as any).swup.hooks) {
				(window as any).swup.hooks.on("content:replace", handleContentReplace);
			}
		});
	}

	// 页面加载完成后也同步一次状态
	document.addEventListener("DOMContentLoaded", () => {
		requestAnimationFrame(() => {
			const newMode = getStoredTheme();
			if (mode !== newMode) {
				mode = newMode;
			}
		});
	});
}
</script>

<div class="relative z-50">
    <button
        aria-label="Light/Dark Mode"
        class="relative btn-plain scale-animation rounded-lg h-11 w-11 active:scale-90 theme-switch-btn"
        id="scheme-switch"
        onclick={toggleScheme}
        data-mode={mode}
    >
        <div class="absolute transition-all duration-300 ease-in-out" class:opacity-0={mode !== LIGHT_MODE} class:rotate-180={mode !== LIGHT_MODE}>
            <Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
        <div class="absolute transition-all duration-300 ease-in-out" class:opacity-0={mode !== DARK_MODE} class:rotate-180={mode !== DARK_MODE}>
            <Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.25rem]"></Icon>
        </div>
    </button>
</div>

<style>
    /* 确保主题切换按钮的背景色即时更新 */
    .theme-switch-btn::before {
        transition: transform 75ms ease-out, background-color 0ms !important;
    }
</style>
