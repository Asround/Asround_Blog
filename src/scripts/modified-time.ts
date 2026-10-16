import { onPageView } from "../utils/page-view";

let timer: ReturnType<typeof setInterval> | undefined;

function renderModifiedTime() {
	const source = document.getElementById("last-modified");
	const target = document.getElementById("modifiedtime");
	if (!source || !target || !source.dataset.lastModified) return false;
	const diff = Date.now() - new Date(source.dataset.lastModified).getTime();
	if (!Number.isFinite(diff)) return false;
	const seconds = Math.floor(diff / 1000);
	const days = Math.floor(seconds / 86400);
	const years = Math.floor(days / 365);
	const months = Math.floor((days % 365) / 30);
	const remainingDays = days % 30;
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const labels = source.dataset;
	let text = `${labels.prefix} `;
	if (years > 0) text += `${years} ${labels.year} `;
	if (months > 0) text += `${months} ${labels.month} `;
	if (remainingDays > 0) text += `${remainingDays} ${labels.day} `;
	text += `${hours} ${labels.hour} ${String(minutes).padStart(2, "0")} ${labels.minute} ${String(secs).padStart(2, "0")} ${labels.second}`;
	target.textContent = text;
	return true;
}

function refresh() {
	clearInterval(timer);
	timer = undefined;
	if (renderModifiedTime()) timer = setInterval(renderModifiedTime, 1000);
}

// One subscription for the persistent layout; one clock only on pages using it.
onPageView(refresh);
refresh();
