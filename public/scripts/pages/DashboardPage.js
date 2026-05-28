/* ================================================
   VPS Manager — Página Dashboard (sem JSX)
   ================================================ */
import React from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { Sidebar } from "../components/Sidebar.js";
import { Topbar } from "../components/Topbar.js";
import { AddonCard } from "../components/AddonCard.js";

function StatCard(props) {
	return React.createElement(
		"div",
		{ className: "bento-card rounded-xl p-md flex flex-col gap-sm" },
		React.createElement(
			"div",
			{ className: "flex items-center justify-between gap-sm" },
			React.createElement("span", { className: "font-label-caps text-label-caps text-on-surface-variant" }, props.label),
			React.createElement("span", { className: "material-symbols-outlined text-on-surface-variant", style: { fontSize: "18px" } }, props.icon),
		),
		React.createElement("strong", { className: "font-headline-sm text-headline-sm text-on-surface" }, props.value || "—"),
		React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant" }, props.detail || "Live snapshot from the connected VPS."),
	);
}

export function DashboardPage() {
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;
	var status = state.vpsStatus || {};
	var system = status.system || {};
	var installedCards = state.installedAddons.map(function (entry) {
		return React.createElement(AddonCard, { key: entry.addon.name, entry: entry });
	});

	function openLibrary() {
		dispatch({ type: "NAVIGATE", payload: { page: "addons", addon: null, view: null } });
	}

	var installedContent =
		installedCards.length > 0
			? React.createElement("div", { className: "bento-grid" }, installedCards)
			: React.createElement(
					"div",
					{ className: "bento-card rounded-xl p-xl flex flex-col items-center justify-center text-center gap-md" },
					React.createElement("span", { className: "material-symbols-outlined text-outline-variant", style: { fontSize: "48px" } }, "extension_off"),
					React.createElement("p", { className: "font-body-lg text-body-lg text-on-surface" }, "No add-ons installed on this VPS yet."),
					React.createElement(
						"p",
						{ className: "font-body-md text-body-md text-on-surface-variant max-w-xl" },
						"Open the library to browse available add-ons and install what this server needs.",
					),
					React.createElement(
						"button",
						{
							className: "font-label-caps text-label-caps py-sm px-md bg-primary text-on-primary rounded-lg hover:bg-primary-fixed transition-colors",
							onClick: openLibrary,
						},
						"Open library",
					),
				);

	var summary = [system.os, system.kernel ? "Kernel " + system.kernel : null, system.arch].filter(Boolean).join(" • ");
	var overviewCards = [
		{ label: "CPU usage", value: system.cpu, detail: system.load ? "Load average: " + system.load : "Current processor activity.", icon: "memory" },
		{ label: "RAM", value: system.memory, detail: "Working memory currently in use.", icon: "developer_board" },
		{ label: "Disk", value: system.disk, detail: "Usage of the root filesystem.", icon: "hard_drive_2" },
		{ label: "Uptime", value: system.uptime, detail: "How long this server has been online.", icon: "schedule" },
	];

	var metricCards = overviewCards.map(function (card) {
		return React.createElement(StatCard, {
			key: card.label,
			label: card.label,
			value: card.value,
			detail: card.detail,
			icon: card.icon,
		});
	});

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
				{ className: "flex-1 p-margin-desktop flex flex-col gap-xl" },
				React.createElement(
					"section",
					{ className: "grid gap-md xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]" },
					React.createElement(
						"div",
						{ className: "bento-card rounded-xl p-xl flex flex-col gap-md" },
						React.createElement("span", { className: "font-label-caps text-label-caps text-primary" }, "Connected VPS"),
						React.createElement("h1", { className: "font-headline-lg text-headline-lg text-on-surface" }, system.hostname || state.session.host || "—"),
						React.createElement(
							"p",
							{ className: "font-body-lg text-body-lg text-on-surface-variant" },
							summary || "Technical details will appear here after the next successful refresh.",
						),
						React.createElement(
							"div",
							{ className: "flex flex-wrap gap-xs" },
							React.createElement(
								"span",
								{ className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" },
								state.session.username || "root",
							),
							React.createElement(
								"span",
								{ className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" },
								status.detectedAt ? "Snapshot ready" : "Awaiting snapshot",
							),
						),
					),
					React.createElement(
						"div",
						{ className: "bento-card rounded-xl p-xl flex flex-col justify-between gap-md" },
						React.createElement("span", { className: "font-label-caps text-label-caps text-secondary" }, "Installed add-ons"),
						React.createElement("strong", { className: "font-headline-lg text-headline-lg text-on-surface" }, String(state.installedAddons.length)),
						React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant" }, "Only add-ons detected on this VPS are listed below."),
						React.createElement(
							"button",
							{
								className:
									"self-start font-label-caps text-label-caps py-sm px-md border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors",
								onClick: openLibrary,
							},
							"Browse library",
						),
					),
				),
				React.createElement("section", { className: "grid gap-md md:grid-cols-2 xl:grid-cols-4" }, metricCards),
				React.createElement(
					"section",
					{ className: "flex flex-col gap-md" },
					React.createElement(
						"div",
						{ className: "flex flex-col gap-xs" },
						React.createElement("h2", { className: "font-headline-md text-headline-md text-on-surface" }, "Installed add-ons"),
						React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant" }, "Management shortcuts for add-ons already present on the connected VPS."),
					),
					installedContent,
				),
			),
		),
	);
}
