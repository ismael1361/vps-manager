/* ================================================
   VPS Manager — Dashboard page
   ================================================ */
import { state } from "../state.js";
import { buildSidebar, buildTopbar, buildAddonCard } from "../components.js";
import { cleanupCurrentView } from "../addon-runner.js";
import { bindSharedEvents } from "../events.js";

export function renderDashboardPage() {
	cleanupCurrentView();
	state.selectedAddon = null;
	state.selectedView = null;

	var cards = state.addons
		.map(function (entry) {
			return buildAddonCard(entry);
		})
		.join("");

	var app = document.getElementById("app");
	app.className = "bg-background text-on-background min-h-screen flex";
	app.innerHTML =
		buildSidebar("dashboard") +
		'<div class="flex-1 flex flex-col md:ml-64">' +
		buildTopbar(true) +
		'<main class="flex-1 p-margin-desktop">' +
		'<div class="mb-xl">' +
		'<h1 class="font-headline-lg text-headline-lg text-on-surface">Add-ons</h1>' +
		'<p class="font-body-md text-body-md text-on-surface-variant mt-xs">Available and installed server components.</p>' +
		"</div>" +
		(cards
			? '<div class="bento-grid">' + cards + "</div>"
			: '<div class="flex flex-col items-center justify-center py-2xl text-center">' +
				'<span class="material-symbols-outlined text-outline-variant mb-md" style="font-size:48px">extension_off</span>' +
				'<p class="font-body-lg text-body-lg text-on-surface-variant">No add-ons found.</p>' +
				"</div>") +
		"</main></div>";

	bindSharedEvents();
}
