/* ================================================
   VPS Manager — Componente Sidebar (sem JSX)
   ================================================ */
import React from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { api } from "../api.js";
import { loadAddonsData } from "../data.js";
import { escHtml } from "../utils.js";
import { cleanupCurrentView } from "../addon-runner.js";

var NAV_ITEMS = [
	{ id: "dashboard", label: "Dashboard", icon: "dashboard" },
	{ id: "addons", label: "Add-ons", icon: "extension" },
	{ id: "settings", label: "Settings", icon: "settings" },
];

export function Sidebar(props) {
	var activePage = props.activePage;
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;

	var host = (state.vpsStatus && state.vpsStatus.connection && state.vpsStatus.connection.host) || state.session.host || "—";
	var user = state.session.username || "root";

	function handleNav(e, itemId) {
		e.preventDefault();
		if (itemId === "dashboard" || itemId === "addons") {
			cleanupCurrentView();
			dispatch({ type: "NAVIGATE", payload: { page: "dashboard", addon: null, view: null } });
		} else if (itemId === "settings") {
			dispatch({ type: "NAVIGATE", payload: { page: "settings" } });
		}
		dispatch({ type: "SET_SIDEBAR_OPEN", payload: false });
	}

	function handleDisconnect(e) {
		e.preventDefault();
		cleanupCurrentView();
		api.disconnect()
			.then(function () {
				dispatch({ type: "SET_SESSION", payload: { connected: false, busy: false } });
				dispatch({ type: "SET_ADDONS", payload: [] });
				dispatch({ type: "SET_INSTALLED", payload: [] });
				dispatch({ type: "SET_VPS_STATUS", payload: null });
				dispatch({ type: "NAVIGATE", payload: { page: "connect", addon: null, view: null } });
			})
			.catch(function (err) {
				console.error("Disconnect error:", err);
			});
	}

	var navItems = NAV_ITEMS.map(function (item) {
		var active = activePage === item.id || (activePage === "addon" && item.id === "addons");
		return React.createElement(
			"li",
			{ key: item.id },
			React.createElement(
				"a",
				{
					href: "#",
					onClick: function (e) {
						handleNav(e, item.id);
					},
					className:
						"flex items-center gap-md px-md py-sm rounded transition-all duration-200 " +
						(active ? "bg-secondary-container text-on-secondary-container font-bold translate-x-0.5" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-variant"),
				},
				React.createElement("span", { className: "material-symbols-outlined" + (active ? " fill" : "") }, item.icon),
				React.createElement("span", { className: "font-body-md text-body-md" }, item.label),
			),
		);
	});

	var sidebarClass = "bg-surface-container-low flex flex-col py-lg px-md w-64 fixed left-0 top-0 bottom-0 z-40 border-r border-outline-variant hidden md:flex" + (state.sidebarOpen ? " open" : "");

	return React.createElement(
		"nav",
		{ id: "sidebar", className: sidebarClass },
		React.createElement(
			"div",
			{ className: "mb-xl flex items-center gap-sm" },
			React.createElement(
				"div",
				{ className: "w-8 h-8 rounded bg-primary flex items-center justify-center text-on-primary shrink-0" },
				React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "18px" } }, "terminal"),
			),
			React.createElement(
				"div",
				{ className: "overflow-hidden" },
				React.createElement("h1", { className: "font-headline-sm text-on-surface truncate", style: { fontSize: "14px", lineHeight: "20px", fontWeight: "600" } }, user),
				React.createElement("p", { className: "font-label-caps text-label-caps text-on-surface-variant truncate" }, host),
			),
		),
		React.createElement("ul", { className: "flex-1 flex flex-col gap-xs" }, navItems),
		React.createElement(
			"div",
			{ className: "mt-auto pt-lg border-t border-outline-variant flex flex-col gap-xs" },
			React.createElement(
				"a",
				{
					href: "#",
					onClick: handleDisconnect,
					className: "flex items-center gap-md px-md py-xs text-error hover:text-on-surface transition-colors",
				},
				React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "18px" } }, "logout"),
				React.createElement("span", { className: "font-body-md text-body-md" }, "Disconnect"),
			),
		),
	);
}
