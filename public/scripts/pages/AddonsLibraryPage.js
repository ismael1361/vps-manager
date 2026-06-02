/* ================================================
   VPS Manager — Página Biblioteca de Add-ons (sem JSX)
   ================================================ */
import React, { useState } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { Sidebar } from "../components/Sidebar.js";
import { Topbar } from "../components/Topbar.js";
import { AddonCard } from "../components/AddonCard.js";
import { getAddonId, getAddonState } from "../utils.js";

function matchesSearch(entry, normalizedQuery) {
	if (!normalizedQuery) {
		return true;
	}

	var addon = entry.addon || {};
	var searchableText = [addon.name, addon.description, addon.version, addon.short_name].filter(Boolean).join(" ").toLowerCase();
	return searchableText.indexOf(normalizedQuery) !== -1;
}

function matchesStatus(entry, statusFilter, addonConfigs) {
	if (statusFilter === "all") {
		return true;
	}

	var addonId = entry.id || getAddonId(entry);
	var configState = getAddonState(addonConfigs, addonId);

	if (statusFilter === "installed") {
		return configState === "installed";
	}

	if (statusFilter === "not-installed") {
		return !configState || configState === "uninstalled";
	}

	if (statusFilter === "pending") {
		return configState === "pending";
	}

	if (statusFilter === "error") {
		return configState === "error";
	}

	return true;
}

export function AddonsLibraryPage() {
	var ctx = useAppState();
	var state = ctx.state;
	var [searchQuery, setSearchQuery] = useState("");
	var [statusFilter, setStatusFilter] = useState("all");

	var normalizedQuery = searchQuery.trim().toLowerCase();
	var filteredEntries = state.addons.filter(function (entry) {
		return matchesSearch(entry, normalizedQuery) && matchesStatus(entry, statusFilter, state.addonConfigs);
	});
	var installedCount = state.addons.filter(function (entry) {
		return matchesStatus(entry, "installed", state.addonConfigs);
	}).length;
	var notInstalledCount = state.addons.filter(function (entry) {
		return matchesStatus(entry, "not-installed", state.addonConfigs);
	}).length;
	var hasActiveFilters = normalizedQuery.length > 0 || statusFilter !== "all";

	var cards = filteredEntries.map(function (entry) {
		return React.createElement(AddonCard, { key: entry.addon.name, entry: entry });
	});

	var content =
		cards.length > 0
			? React.createElement("div", { className: "bento-grid" }, cards)
			: React.createElement(
					"div",
					{ className: "bento-card rounded-xl flex flex-col items-center justify-center py-2xl text-center" },
					React.createElement("span", { className: "material-symbols-outlined text-outline-variant mb-md", style: { fontSize: "48px" } }, "extension_off"),
					React.createElement(
						"p",
						{ className: "font-body-lg text-body-lg text-on-surface-variant" },
						hasActiveFilters ? "No add-ons match the current filters." : "No add-ons found in the current catalog.",
					),
					hasActiveFilters
						? React.createElement(
								"button",
								{
									type: "button",
									className:
										"mt-md font-label-caps text-label-caps py-sm px-md border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors",
									onClick: function () {
										setSearchQuery("");
										setStatusFilter("all");
									},
								},
								"Clear filters",
							)
						: null,
				);

	return React.createElement(
		"div",
		{ className: "bg-background text-on-background min-h-screen flex" },
		React.createElement(Sidebar, { activePage: "addons" }),
		React.createElement(
			"div",
			{ className: "flex-1 flex flex-col md:ml-64" },
			React.createElement(Topbar, { connected: true }),
			React.createElement(
				"main",
				{ className: "flex-1 p-margin-desktop flex flex-col gap-lg" },
				React.createElement(
					"div",
					{ className: "mb-xl flex items-end justify-between gap-md flex-wrap" },
					React.createElement(
						"div",
						null,
						React.createElement("h1", { className: "font-headline-lg text-headline-lg text-on-surface" }, "Add-on Library"),
						React.createElement(
							"p",
							{ className: "font-body-md text-body-md text-on-surface-variant mt-xs" },
							"Browse the full catalog and install new capabilities on the connected VPS.",
						),
					),
					React.createElement(
						"span",
						{ className: "font-code-block text-code-block text-on-surface bg-surface-container-high px-sm py-xs rounded" },
						String(filteredEntries.length) + " visible",
					),
				),
				React.createElement(
					"section",
					{ className: "bento-card rounded-xl p-md flex flex-col gap-md" },
					React.createElement(
						"div",
						{ className: "flex flex-wrap gap-xs items-center justify-between" },
						React.createElement("span", { className: "font-label-caps text-label-caps text-on-surface-variant" }, "Filters"),
						React.createElement(
							"div",
							{ className: "flex flex-wrap gap-xs" },
							React.createElement(
								"span",
								{ className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" },
								String(installedCount) + " installed",
							),
							React.createElement(
								"span",
								{ className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" },
								String(notInstalledCount) + " not installed",
							),
						),
					),
					React.createElement(
						"div",
						{ className: "grid gap-md lg:grid-cols-[minmax(0,1.4fr)_220px_auto]" },
						React.createElement(
							"div",
							null,
							React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Search"),
							React.createElement("input", {
								type: "search",
								placeholder: "Search by name, description or version",
								value: searchQuery,
								onChange: function (e) {
									setSearchQuery(e.target.value);
								},
								className:
									"bg-surface-container border border-outline-variant rounded-lg px-sm py-sm font-body-md text-body-md text-on-surface w-full outline-none focus:border-primary",
							}),
						),
						React.createElement(
							"div",
							null,
							React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Status"),
							React.createElement(
								"select",
								{
									value: statusFilter,
									onChange: function (e) {
										setStatusFilter(e.target.value);
									},
									className:
										"bg-surface-container border border-outline-variant rounded-lg px-sm py-sm font-body-md text-body-md text-on-surface w-full outline-none focus:border-primary",
								},
								React.createElement("option", { value: "all" }, "All add-ons"),
								React.createElement("option", { value: "installed" }, "Installed only"),
								React.createElement("option", { value: "not-installed" }, "Not installed only"),
								React.createElement("option", { value: "pending" }, "Pending installs"),
								React.createElement("option", { value: "error" }, "With errors"),
							),
						),
						React.createElement(
							"div",
							{ className: "flex items-end" },
							hasActiveFilters
								? React.createElement(
										"button",
										{
											type: "button",
											className:
												"w-full py-sm px-md border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors font-label-caps text-label-caps",
											onClick: function () {
												setSearchQuery("");
												setStatusFilter("all");
											},
										},
										"Reset",
									)
								: React.createElement("div", { className: "w-full py-sm px-md text-center font-body-md text-body-md text-on-surface-variant" }, "Showing the full catalog"),
						),
					),
				),
				content,
			),
		),
	);
}
