/* ================================================
   VPS Manager — Shared UI components / builders
   ================================================ */
import { state, isInstalled } from "./state.js";
import { escHtml, getAddonIcon } from "./utils.js";

var NAV_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: "dashboard" },
	{ id: "addons", label: "Add-ons", icon: "extension" },
	{ id: "settings", label: "Settings", icon: "settings" },
];

export function buildSidebar(activePage) {
	var host = (state.vpsStatus && state.vpsStatus.connection && state.vpsStatus.connection.host) || state.session.host || "—";
	var user = state.session.username || "root";

	var navItems = NAV_ITEMS.map(function (item) {
		var active = activePage === item.id || (activePage === "addon" && item.id === "addons");
		return (
			"<li>" +
			'<a href="#" data-nav="' +
			item.id +
			'" class="flex items-center gap-md px-md py-sm rounded transition-all duration-200 ' +
			(active ? "bg-secondary-container text-on-secondary-container font-bold translate-x-0.5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant") +
			'">' +
			'<span class="material-symbols-outlined' +
			(active ? " fill" : "") +
			'">' +
			item.icon +
			"</span>" +
			'<span class="font-body-md text-body-md">' +
			item.label +
			"</span>" +
			"</a></li>"
		);
	}).join("");

	return (
		'<nav id="sidebar" class="bg-surface-container-low flex flex-col py-lg px-md w-64 fixed left-0 top-0 bottom-0 z-40 border-r border-outline-variant hidden md:flex">' +
		'<div class="mb-xl flex items-center gap-sm">' +
		'<div class="w-8 h-8 rounded bg-primary flex items-center justify-center text-on-primary shrink-0">' +
		'<span class="material-symbols-outlined" style="font-size:18px">terminal</span>' +
		"</div>" +
		'<div class="overflow-hidden">' +
		'<h1 class="font-headline-sm text-on-surface truncate" style="font-size:14px;line-height:20px;font-weight:600">' +
		escHtml(user) +
		"</h1>" +
		'<p class="font-label-caps text-label-caps text-on-surface-variant truncate">' +
		escHtml(host) +
		"</p>" +
		"</div></div>" +
		'<ul class="flex-1 flex flex-col gap-xs">' +
		navItems +
		"</ul>" +
		'<div class="mt-auto pt-lg border-t border-outline-variant flex flex-col gap-xs">' +
		'<a href="#" data-action="disconnect" class="flex items-center gap-md px-md py-xs text-error hover:text-on-surface transition-colors">' +
		'<span class="material-symbols-outlined" style="font-size:18px">logout</span>' +
		'<span class="font-body-md text-body-md">Disconnect</span>' +
		"</a></div></nav>"
	);
}

export function buildTopbar(connected) {
	var host = state.session.host || "—";
	if (!connected) {
		return (
			'<header class="bg-surface-container border-b border-outline-variant flex justify-between items-center w-full px-md h-14 sticky top-0 z-50">' +
			'<span class="font-label-caps text-label-caps tracking-widest text-primary">VPS_MANAGER</span>' +
			'<div class="flex items-center gap-xs text-error font-code-block text-code-block">' +
			'<span class="w-2 h-2 rounded-full bg-error inline-block shrink-0"></span>Disconnected' +
			"</div></header>"
		);
	}
	return (
		'<header class="bg-surface-container border-b border-outline-variant flex justify-between items-center w-full px-md h-14 sticky top-0 z-30">' +
		'<div class="flex items-center gap-sm">' +
		'<span class="font-label-caps text-label-caps tracking-widest text-primary hidden-sm">VPS_MANAGER</span>' +
		'<button class="md:hidden text-on-surface-variant p-xs rounded hover:bg-surface-variant" data-action="toggle-sidebar">' +
		'<span class="material-symbols-outlined">menu</span></button>' +
		"</div>" +
		'<div class="flex items-center gap-md">' +
		'<div class="flex items-center gap-xs px-sm py-xs bg-surface-variant rounded border border-outline-variant">' +
		'<div class="status-dot"></div>' +
		'<span class="font-code-block text-code-block text-on-surface">' +
		escHtml(host) +
		"</span>" +
		"</div>" +
		'<div class="flex gap-xs text-on-surface-variant">' +
		'<button class="hover:bg-surface-variant transition-colors p-xs rounded" data-action="refresh-status" title="Refresh status">' +
		'<span class="material-symbols-outlined">sensors</span></button>' +
		"</div></div></header>"
	);
}

export function buildAddonCard(entry) {
	var addon = entry.addon;
	var installed = isInstalled(addon.name);
	var iconInfo = getAddonIcon(addon.name);

	return (
		'<div class="bento-card rounded-xl p-md flex flex-col">' +
		'<div class="flex justify-between items-start mb-sm">' +
		'<div class="p-sm bg-surface-variant rounded-lg ' +
		iconInfo.color +
		'">' +
		'<span class="material-symbols-outlined" style="font-size:24px">' +
		iconInfo.icon +
		"</span>" +
		"</div>" +
		'<span class="font-code-block text-code-block text-on-surface-variant bg-surface-container-highest px-xs py-[2px] rounded">' +
		escHtml(addon.version) +
		"</span>" +
		"</div>" +
		'<h3 class="font-headline-sm text-headline-sm text-on-surface mb-xs">' +
		escHtml(addon.name) +
		"</h3>" +
		'<p class="font-body-md text-body-md text-on-surface-variant mb-md flex-1">' +
		escHtml(addon.description) +
		"</p>" +
		(installed
			? '<button data-action="open-addon" data-addon="' +
				escHtml(addon.name) +
				'" class="w-full font-label-caps text-label-caps py-sm border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors">Manage</button>'
			: '<button data-action="install-addon" data-addon="' +
				escHtml(addon.name) +
				'" class="w-full font-label-caps text-label-caps py-sm bg-primary text-on-primary rounded-lg hover:bg-primary-fixed transition-colors">Install</button>') +
		"</div>"
	);
}

export function buildTip(icon, title, body) {
	return (
		'<li class="flex gap-sm items-start">' +
		'<span class="material-symbols-outlined text-outline-variant mt-xs shrink-0" style="font-size:18px">' +
		icon +
		"</span>" +
		'<div><h3 class="font-body-md text-body-md font-semibold text-on-surface">' +
		title +
		"</h3>" +
		'<p class="font-body-md text-body-md text-on-surface-variant mt-xs leading-relaxed">' +
		body +
		"</p>" +
		"</div></li>"
	);
}
