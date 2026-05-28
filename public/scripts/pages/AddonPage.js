/* ================================================
   VPS Manager — Página de Gerenciamento de Addon (sem JSX)
   ================================================ */
import React, { useRef, useEffect, useState } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { getAddonIcon, getAddonId, getAddonState, getAddonConfigEntry } from "../utils.js";
import { api } from "../api.js";
import { loadAddonsData } from "../data.js";
import { Sidebar } from "../components/Sidebar.js";
import { Topbar } from "../components/Topbar.js";
import { Terminal } from "../components/Terminal.js";
import { runAddonView, cleanupCurrentView, runAddonLifecycle } from "../addon-runner.js";

export function AddonPage() {
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;

	var addonName = state.selectedAddon;
	var viewName = state.selectedView;

	var entry = state.addons.find(function (a) {
		return a.addon.name === addonName;
	});

	// Redireciona se addon não encontrado
	useEffect(
		function () {
			if (!entry) {
				dispatch({ type: "NAVIGATE", payload: { page: "addons" } });
			}
		},
		[entry],
	);

	if (!entry) return null;

	var addon = entry.addon;
	var addonId = entry.id || getAddonId(entry);
	var views = addon.views || [];
	var iconInfo = getAddonIcon(addonName);
	var configState = getAddonState(state.addonConfigs, addonId);
	var configEntry = getAddonConfigEntry(state.addonConfigs, addonId);

	// Define view padrão
	var activeView = viewName || (views.length > 0 ? views[0].name : null);
	var viewDef = views.find(function (v) {
		return v.name === activeView;
	});

	var containerRef = useRef(null);
	var initRan = useRef(false);
	var [uninstalling, setUninstalling] = useState(false);

	function appendLine(line) {
		dispatch({ type: "APPEND_TERMINAL", payload: line });
	}

	// Run initialize() once when the page opens
	useEffect(
		function () {
			if (!entry || initRan.current) return;
			initRan.current = true;
			runAddonLifecycle(entry, "initialize", appendLine, dispatch)
				.then(function () {
					dispatch({ type: "CLEAR_TERMINAL" });
				})
				.catch(function () {});
		},
		[addonId],
	);

	// Executa o addon view quando muda o viewDef
	useEffect(
		function () {
			if (!containerRef.current || !viewDef) return;
			runAddonView(viewDef, addonName, containerRef.current, appendLine);
			dispatch({ type: "CLEAR_TERMINAL" });
			return function () {
				cleanupCurrentView();
			};
		},
		[viewDef && viewDef.name, addonName],
	);

	function handleTabClick(v) {
		if (v.name !== activeView) {
			dispatch({ type: "SELECT_VIEW", payload: v.name });
		}
	}

	function handleNavAddons(e) {
		e.preventDefault();
		cleanupCurrentView();
		dispatch({ type: "NAVIGATE", payload: { page: "addons", addon: null, view: null } });
	}

	function handleUninstall() {
		if (uninstalling) return;
		if (!window.confirm("Uninstall " + addon.name + "? This will run the uninstall script and remove all configuration.")) return;
		setUninstalling(true);
		dispatch({ type: "CLEAR_TERMINAL" });
		appendLine({ type: "info", text: "Uninstalling " + addon.name + "…" });

		runAddonLifecycle(entry, "uninstall", appendLine, dispatch)
			.then(function (result) {
				if (result.success) {
					return api.removeAddonConfig(addonId).then(function () {
						dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: null } });
						return loadAddonsData(state.session, dispatch).then(function () {
							dispatch({ type: "NAVIGATE", payload: { page: "addons", addon: null, view: null } });
						});
					});
				}
			})
			.catch(function (err) {
				appendLine({ type: "error", text: "✗ Uninstall failed: " + err.message });
			})
			.finally(function () {
				setUninstalling(false);
			});
	}

	var host = state.session.host || "—";
	var username = state.session.username || "root";

	// Tabs
	var tabs = views.map(function (v) {
		var active = v.name === activeView;
		return React.createElement(
			"button",
			{
				key: v.name,
				className:
					"select-view-tab px-md py-sm font-label-caps text-label-caps border-b-2 transition-colors whitespace-nowrap " +
					(active ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant"),
				onClick: function () {
					handleTabClick(v);
				},
			},
			v.name,
		);
	});

	// ---- State badge ----
	var stateBadge = null;
	if (configState === "installed") {
		stateBadge = React.createElement(
			"span",
			{ className: "flex items-center gap-xs font-code-block text-code-block text-primary bg-primary-container px-xs py-[2px] rounded" },
			React.createElement("span", { className: "material-symbols-outlined fill", style: { fontSize: "12px" } }, "check_circle"),
			"installed",
		);
	} else if (configState === "error") {
		stateBadge = React.createElement(
			"span",
			{
				className: "flex items-center gap-xs font-code-block text-code-block text-error bg-error-container px-xs py-[2px] rounded",
				title: configEntry && configEntry.metadata && configEntry.metadata.error ? configEntry.metadata.error : "",
			},
			React.createElement("span", { className: "material-symbols-outlined fill", style: { fontSize: "12px" } }, "error"),
			"error",
		);
	} else if (configState === "pending") {
		stateBadge = React.createElement("span", { className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" }, "pending…");
	} else {
		stateBadge = React.createElement("span", { className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" }, "not installed");
	}

	// ---- Icon ----
	var iconEl;
	if (addon.icon && addon.icon.src) {
		iconEl = React.createElement("img", { src: addon.icon.src, alt: addon.name, style: { width: "28px", height: "28px" } });
	} else {
		iconEl = React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "28px" } }, iconInfo.icon);
	}

	return React.createElement(
		"div",
		{ className: "bg-background text-on-background h-screen overflow-hidden flex" },
		React.createElement(Sidebar, { activePage: "addon" }),
		React.createElement(
			"div",
			{ className: "flex-1 flex flex-col md:ml-64 overflow-hidden" },
			React.createElement(Topbar, { connected: true }),

			// Breadcrumb
			React.createElement(
				"div",
				{ className: "px-margin-desktop pt-md pb-xs flex items-center gap-xs text-on-surface-variant font-label-caps text-label-caps" },
				React.createElement("a", { href: "#", onClick: handleNavAddons, className: "hover:text-on-surface transition-colors" }, "Library"),
				React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "14px" } }, "chevron_right"),
				React.createElement("span", { className: "text-on-surface" }, addonName),
			),

			// Addon header
			React.createElement(
				"div",
				{ className: "px-margin-desktop py-md flex items-start gap-md border-b border-outline-variant" },
				React.createElement("div", { className: "p-sm bg-surface-variant rounded-lg " + iconInfo.color + " shrink-0" }, iconEl),
				React.createElement(
					"div",
					{ className: "flex-1 min-w-0" },
					React.createElement(
						"div",
						{ className: "flex items-center gap-sm flex-wrap" },
						React.createElement("h1", { className: "font-headline-md text-headline-md text-on-surface" }, addonName),
						React.createElement("span", { className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" }, "v" + addon.version),
						stateBadge,
					),
					React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant mt-xs" }, addon.description),
				),
				// Uninstall button — only visible when installed or error
				configState === "installed" || configState === "error"
					? React.createElement(
							"button",
							{
								className:
									"shrink-0 flex items-center gap-xs font-label-caps text-label-caps py-sm px-md border border-error text-error rounded-lg hover:bg-error-container transition-colors" +
									(uninstalling ? " opacity-50 cursor-not-allowed" : ""),
								onClick: handleUninstall,
								disabled: uninstalling,
								title: "Uninstall addon",
							},
							React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "16px" } }, "delete"),
							uninstalling ? "Removing…" : "Uninstall",
						)
					: null,
			),

			// View tabs
			views.length > 0 ? React.createElement("div", { className: "px-margin-desktop flex gap-xs border-b border-outline-variant overflow-x-auto" }, tabs) : null,

			// Conteúdo + terminal
			React.createElement(
				"div",
				{ className: "flex-1 flex flex-col overflow-hidden", style: { minHeight: 0 } },
				React.createElement("div", {
					ref: containerRef,
					className: "flex-1 overflow-y-auto p-margin-desktop",
					style: { minHeight: 0 },
				}),
				React.createElement(Terminal),
			),
		),
	);
}
