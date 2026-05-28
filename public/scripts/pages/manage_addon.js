/* ================================================
   VPS Manager — Addon management page
   ================================================ */
import { state, isInstalled } from "../state.js";
import { escHtml, getAddonIcon } from "../utils.js";
import { buildSidebar, buildTopbar } from "../components.js";
import { buildTerminalHTML, appendTerminalLine, flushTerminal } from "../terminal.js";
import { runAddonView, cleanupCurrentView } from "../addon-runner.js";
import { bindSharedEvents } from "../events.js";
import { navigate } from "../router.js";
import { api } from "../api.js";

export function renderAddonPage(addonName, viewName) {
	var entry = state.addons.find(function (a) {
		return a.addon.name === addonName;
	});
	if (!entry) {
		navigate("dashboard");
		return;
	}

	var addon = entry.addon;
	var views = addon.views || [];
	var iconInfo = getAddonIcon(addonName);
	var installed = isInstalled(addonName);

	// Default to first view
	if (!viewName && views.length > 0) viewName = views[0].name;
	state.selectedAddon = addonName;
	state.selectedView = viewName;

	// View tabs
	var tabs = views
		.map(function (v) {
			var active = v.name === viewName;
			return (
				'<button class="select-view-tab px-md py-sm font-label-caps text-label-caps border-b-2 transition-colors whitespace-nowrap ' +
				(active ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant") +
				'" data-view="' +
				escHtml(v.name) +
				'">' +
				escHtml(v.name) +
				"</button>"
			);
		})
		.join("");

	var host = state.session.host || "—";
	var username = state.session.username || "root";

	var app = document.getElementById("app");
	app.className = "bg-background text-on-background h-screen overflow-hidden flex";
	app.innerHTML =
		buildSidebar("addons") +
		'<div class="flex-1 flex flex-col md:ml-64 overflow-hidden">' +
		buildTopbar(true) +
		// Breadcrumb
		'<div class="px-margin-desktop pt-md pb-xs flex items-center gap-xs text-on-surface-variant font-label-caps text-label-caps">' +
		'<a href="#" data-nav="addons" class="hover:text-on-surface transition-colors">Add-ons</a>' +
		'<span class="material-symbols-outlined" style="font-size:14px">chevron_right</span>' +
		'<span class="text-on-surface">' +
		escHtml(addonName) +
		"</span>" +
		"</div>" +
		// Addon header
		'<div class="px-margin-desktop py-md flex items-start gap-md border-b border-outline-variant">' +
		'<div class="p-sm bg-surface-variant rounded-lg ' +
		iconInfo.color +
		' shrink-0">' +
		'<span class="material-symbols-outlined" style="font-size:28px">' +
		iconInfo.icon +
		"</span>" +
		"</div>" +
		'<div class="flex-1 min-w-0">' +
		'<div class="flex items-center gap-sm">' +
		'<h1 class="font-headline-md text-headline-md text-on-surface">' +
		escHtml(addonName) +
		"</h1>" +
		'<span class="font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded">v' +
		escHtml(addon.version) +
		"</span>" +
		(installed
			? '<span class="flex items-center gap-xs font-code-block text-code-block text-primary bg-primary-container px-xs py-[2px] rounded"><span class="material-symbols-outlined fill" style="font-size:12px">check_circle</span>installed</span>'
			: '<span class="font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded">not installed</span>') +
		"</div>" +
		'<p class="font-body-md text-body-md text-on-surface-variant mt-xs">' +
		escHtml(addon.description) +
		"</p>" +
		"</div></div>" +
		// View tabs
		(views.length > 0 ? '<div class="px-margin-desktop flex gap-xs border-b border-outline-variant overflow-x-auto">' + tabs + "</div>" : "") +
		// Main content area + terminal
		'<div class="flex-1 flex flex-col overflow-hidden" style="min-height:0">' +
		'<div id="view-container" class="flex-1 overflow-y-auto p-margin-desktop" style="min-height:0"></div>' +
		// Terminal panel
		'<div id="terminal-panel" class="flex flex-col border-t border-outline-variant bg-surface-container-low transition-all" style="height:' +
		(state.terminalVisible ? "280px" : "44px") +
		'">' +
		'<div class="flex items-center justify-between px-md h-11 shrink-0 cursor-default select-none">' +
		'<span class="flex items-center gap-xs font-code-block text-code-block text-on-surface-variant" style="font-size:11px">' +
		'<span class="material-symbols-outlined" style="font-size:14px">terminal</span>' +
		escHtml(username) +
		"@" +
		escHtml(host) +
		"</span>" +
		'<div class="flex gap-xs">' +
		'<button id="copy-terminal"   class="p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors" title="Copy output">' +
		'<span class="material-symbols-outlined" style="font-size:16px">content_copy</span></button>' +
		'<button id="clear-terminal"  class="p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors" title="Clear">' +
		'<span class="material-symbols-outlined" style="font-size:16px">delete_sweep</span></button>' +
		'<button id="toggle-terminal" class="p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors" title="Toggle terminal">' +
		'<span class="material-symbols-outlined" style="font-size:16px">' +
		(state.terminalVisible ? "expand_more" : "expand_less") +
		"</span></button>" +
		"</div></div>" +
		'<div id="terminal-output" class="flex-1 overflow-y-auto px-md pb-md font-code-block text-code-block" style="font-size:12px;line-height:18px">' +
		buildTerminalHTML() +
		"</div></div>" +
		"</div>" + // flex-1 column
		"</div>"; // md:ml-64

	bindSharedEvents();
	bindAddonPageEvents(entry);

	// Render the active view
	var viewDef = views.find(function (v) {
		return v.name === viewName;
	});
	var container = document.getElementById("view-container");
	if (viewDef && container) runAddonView(viewDef, addonName, container);
}

// ---- Private event bindings ----
function bindAddonPageEvents(entry) {
	var addonName = entry.addon.name;
	var views = entry.addon.views || [];

	// View tab switching
	document.querySelectorAll(".select-view-tab").forEach(function (btn) {
		btn.addEventListener("click", function () {
			var viewName = btn.dataset.view;
			var viewDef = views.find(function (v) {
				return v.name === viewName;
			});
			if (!viewDef) return;

			state.selectedView = viewName;
			state.terminal = [];
			flushTerminal();

			// Update active tab style
			document.querySelectorAll(".select-view-tab").forEach(function (b) {
				b.className = b.className.replace(/border-primary\s*text-primary/g, "").replace(/border-transparent\s*text-on-surface-variant/g, "");
				if (b === btn) {
					b.classList.add("border-primary", "text-primary");
					b.classList.remove("border-transparent", "text-on-surface-variant", "hover:text-on-surface", "hover:border-outline-variant");
				} else {
					b.classList.add("border-transparent", "text-on-surface-variant");
					b.classList.remove("border-primary", "text-primary");
				}
			});

			var container = document.getElementById("view-container");
			if (container) runAddonView(viewDef, addonName, container);
		});
	});

	// Copy terminal
	var copyBtn = document.getElementById("copy-terminal");
	if (copyBtn) {
		copyBtn.addEventListener("click", function () {
			var text = state.terminal
				.map(function (l) {
					return l.text;
				})
				.join("\n");
			navigator.clipboard.writeText(text).catch(function () {});
		});
	}

	// Clear terminal
	var clearBtn = document.getElementById("clear-terminal");
	if (clearBtn) {
		clearBtn.addEventListener("click", function () {
			state.terminal = [];
			flushTerminal();
		});
	}

	// Toggle terminal panel
	var toggleBtn = document.getElementById("toggle-terminal");
	if (toggleBtn) {
		toggleBtn.addEventListener("click", function () {
			state.terminalVisible = !state.terminalVisible;
			var panel = document.getElementById("terminal-panel");
			var icon = toggleBtn.querySelector(".material-symbols-outlined");
			if (panel) panel.style.height = state.terminalVisible ? "280px" : "44px";
			if (icon) icon.textContent = state.terminalVisible ? "expand_more" : "expand_less";
			if (state.terminalVisible) flushTerminal();
		});
	}
}
