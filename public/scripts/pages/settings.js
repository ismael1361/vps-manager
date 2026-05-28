/* ================================================
   VPS Manager — Settings page (placeholder)
   ================================================ */
import { buildSidebar, buildTopbar } from "../components.js";
import { bindSharedEvents } from "../events.js";

export function renderSettingsPage() {
	var app = document.getElementById("app");
	app.className = "bg-background text-on-background min-h-screen flex";
	app.innerHTML =
		buildSidebar("settings") +
		'<div class="flex-1 flex flex-col md:ml-64">' +
		buildTopbar(true) +
		'<main class="flex-1 p-margin-desktop flex flex-col items-center justify-center text-center">' +
		'<span class="material-symbols-outlined text-outline-variant mb-md" style="font-size:48px">settings</span>' +
		'<h1 class="font-headline-md text-headline-md text-on-surface mb-xs">Settings</h1>' +
		'<p class="font-body-md text-body-md text-on-surface-variant">Coming soon.</p>' +
		"</main></div>";

	bindSharedEvents();
}
