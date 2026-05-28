/* ================================================
   VPS Manager — Página Dashboard (sem JSX)
   ================================================ */
import React from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { Sidebar } from "../components/Sidebar.js";
import { Topbar } from "../components/Topbar.js";
import { AddonCard } from "../components/AddonCard.js";

export function DashboardPage() {
	var ctx = useAppState();
	var state = ctx.state;

	var cards = state.addons.map(function (entry) {
		return React.createElement(AddonCard, { key: entry.addon.name, entry: entry });
	});

	var content =
		cards.length > 0
			? React.createElement("div", { className: "bento-grid" }, cards)
			: React.createElement(
					"div",
					{ className: "flex flex-col items-center justify-center py-2xl text-center" },
					React.createElement("span", { className: "material-symbols-outlined text-outline-variant mb-md", style: { fontSize: "48px" } }, "extension_off"),
					React.createElement("p", { className: "font-body-lg text-body-lg text-on-surface-variant" }, "No add-ons found."),
				);

	return React.createElement(
		"div",
		{ className: "bg-background text-on-background min-h-screen flex" },
		React.createElement(Sidebar, { activePage: "dashboard" }),
		React.createElement(
			"div",
			{ className: "flex-1 flex flex-col md:ml-64" },
			React.createElement(Topbar, { connected: true }),
			React.createElement(
				"main",
				{ className: "flex-1 p-margin-desktop" },
				React.createElement(
					"div",
					{ className: "mb-xl" },
					React.createElement("h1", { className: "font-headline-lg text-headline-lg text-on-surface" }, "Add-ons"),
					React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant mt-xs" }, "Available and installed server components."),
				),
				content,
			),
		),
	);
}
