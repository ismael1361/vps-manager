/* ================================================
   VPS Manager — Componente AddonCard (sem JSX)
   ================================================ */
import React, { useState } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { getAddonIcon, getAddonId, getAddonState } from "../utils.js";
import { api } from "../api.js";
import { loadAddonsData } from "../data.js";
import { cleanupCurrentView, runAddonLifecycle } from "../addon-runner.js";

export function AddonCard(props) {
	var entry = props.entry;
	var addon = entry.addon;
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;

	var addonId = entry.id || getAddonId(entry);
	var configState = getAddonState(state.addonConfigs, addonId);
	var configEntry = state.addonConfigs[addonId] || null;
	var iconInfo = getAddonIcon(addon.name);

	var [busy, setBusy] = useState(false);

	function appendLine(line) {
		dispatch({ type: "APPEND_TERMINAL", payload: line });
	}

	function handleOpenAddon() {
		cleanupCurrentView();
		dispatch({ type: "NAVIGATE", payload: { page: "addon", addon: addon.name, view: null } });
	}

	function handleInstallAddon() {
		if (busy) return;
		setBusy(true);
		dispatch({ type: "CLEAR_TERMINAL" });

		// 1. Create pending entry in config
		api.patchAddonConfig(addonId, {
			metadata: { name: addon.name, version: addon.version },
			state: "pending",
		})
			.then(function (pendingEntry) {
				dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: pendingEntry } });
				appendLine({ type: "info", text: "Installing " + addon.name + "…" });

				// 2. Run install() lifecycle function
				return runAddonLifecycle(entry, "install", appendLine, dispatch);
			})
			.then(function (result) {
				// 3. Update config state based on result
				var newState = result.success ? "installed" : "error";
				return api.patchAddonConfig(addonId, {
					state: newState,
					error: result.error,
				});
			})
			.then(function (updatedEntry) {
				dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: updatedEntry } });
				if (updatedEntry.state === "installed") {
					return loadAddonsData(state.session, dispatch).then(function () {
						appendLine({ type: "success", text: "✓ " + addon.name + " installed successfully." });
						return updatedEntry;
					});
				}
				return updatedEntry;
			})
			.catch(function (err) {
				appendLine({ type: "error", text: "✗ Install failed: " + err.message });
				api.patchAddonConfig(addonId, { state: "error", error: err.message })
					.then(function (e) {
						dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: e } });
					})
					.catch(function () {});
			})
			.finally(function () {
				setBusy(false);
			});
	}

	// ---- Determine button to render based on config state ----
	var actionButton;

	if (configState === "installed") {
		actionButton = React.createElement(
			"button",
			{
				className: "w-full font-label-caps text-label-caps py-sm border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors",
				onClick: handleOpenAddon,
			},
			"Manage",
		);
	} else if (configState === "pending" || busy) {
		actionButton = React.createElement(
			"button",
			{
				className: "w-full font-label-caps text-label-caps py-sm bg-surface-container-highest text-on-surface-variant rounded-lg cursor-not-allowed",
				disabled: true,
			},
			React.createElement("span", { className: "material-symbols-outlined animate-spin align-middle mr-xs", style: { fontSize: "14px" } }, "progress_activity"),
			"Installing…",
		);
	} else if (configState === "error") {
		actionButton = React.createElement(
			"button",
			{
				className: "w-full font-label-caps text-label-caps py-sm bg-error-container text-on-error-container rounded-lg hover:opacity-80 transition-opacity",
				onClick: handleInstallAddon,
				title: configEntry && configEntry.metadata && configEntry.metadata.error ? configEntry.metadata.error : "Installation failed",
			},
			React.createElement("span", { className: "material-symbols-outlined align-middle mr-xs", style: { fontSize: "14px" } }, "error"),
			"Retry",
		);
	} else {
		actionButton = React.createElement(
			"button",
			{
				className: "w-full font-label-caps text-label-caps py-sm bg-primary text-on-primary rounded-lg hover:bg-primary-fixed transition-colors",
				onClick: handleInstallAddon,
				disabled: busy,
			},
			"Install",
		);
	}

	// ---- State badge ----
	var badge = null;
	if (configState === "installed") {
		badge = React.createElement(
			"span",
			{ className: "flex items-center gap-xs font-code-block text-code-block text-primary bg-primary-container px-xs py-[2px] rounded" },
			React.createElement("span", { className: "material-symbols-outlined fill", style: { fontSize: "12px" } }, "check_circle"),
			"installed",
		);
	} else if (configState === "error") {
		badge = React.createElement(
			"span",
			{ className: "flex items-center gap-xs font-code-block text-code-block text-error bg-error-container px-xs py-[2px] rounded" },
			React.createElement("span", { className: "material-symbols-outlined fill", style: { fontSize: "12px" } }, "error"),
			"error",
		);
	} else if (configState === "pending") {
		badge = React.createElement("span", { className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" }, "pending…");
	}

	// Use manifest icon (data URI / URL) when available; otherwise fall back to material icon
	var iconEl;
	if (addon.icon && addon.icon.src) {
		iconEl = React.createElement("img", { src: addon.icon.src, alt: addon.name, style: { width: "24px", height: "24px" } });
	} else {
		iconEl = React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "24px" } }, iconInfo.icon);
	}

	return React.createElement(
		"div",
		{ className: "bento-card rounded-xl p-md flex flex-col" },
		React.createElement(
			"div",
			{ className: "flex justify-between items-start mb-sm" },
			React.createElement("div", { className: "p-sm bg-surface-variant rounded-lg " + iconInfo.color }, iconEl),
			React.createElement(
				"div",
				{ className: "flex items-center gap-xs" },
				badge,
				React.createElement("span", { className: "font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded" }, "v" + addon.version),
			),
		),
		React.createElement("h3", { className: "font-headline-sm text-headline-sm text-on-surface mb-xs" }, addon.name),
		React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant mb-md flex-1" }, addon.description),
		actionButton,
	);
}
