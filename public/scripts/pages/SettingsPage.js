/* ================================================
   VPS Manager — Página de Configurações (sem JSX)
   ================================================ */
import React from "https://esm.sh/react@18";
import { Sidebar } from "../components/Sidebar.js";
import { Topbar } from "../components/Topbar.js";

export function SettingsPage() {
	return React.createElement(
		"div",
		{ className: "bg-background text-on-background min-h-screen flex" },
		React.createElement(Sidebar, { activePage: "settings" }),
		React.createElement(
			"div",
			{ className: "flex-1 flex flex-col md:ml-64" },
			React.createElement(Topbar, { connected: true }),
			React.createElement(
				"main",
				{ className: "flex-1 p-margin-desktop flex flex-col items-center justify-center text-center" },
				React.createElement("span", { className: "material-symbols-outlined text-outline-variant mb-md", style: { fontSize: "48px" } }, "settings"),
				React.createElement("h1", { className: "font-headline-md text-headline-md text-on-surface mb-xs" }, "Settings"),
				React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant" }, "Coming soon."),
			),
		),
	);
}
