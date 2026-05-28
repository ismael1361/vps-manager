/* ================================================
   VPS Manager — Componente Topbar (sem JSX)
   ================================================ */
import React from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { loadAddonsData } from "../data.js";

export function Topbar(props) {
	var connected = props.connected;
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;

	var host = state.session.host || "—";

	function handleRefreshStatus() {
		loadAddonsData(state.session, dispatch).catch(function () {});
	}

	function handleToggleSidebar() {
		dispatch({ type: "SET_SIDEBAR_OPEN", payload: !state.sidebarOpen });
	}

	if (!connected) {
		return React.createElement(
			"header",
			{
				className: "bg-surface-container border-b border-outline-variant flex justify-between items-center w-full px-md h-14 sticky top-0 z-50",
			},
			React.createElement("span", { className: "font-label-caps text-label-caps tracking-widest text-primary" }, "VPS_MANAGER"),
			React.createElement(
				"div",
				{ className: "flex items-center gap-xs text-error font-code-block text-code-block" },
				React.createElement("span", { className: "w-2 h-2 rounded-full bg-error inline-block shrink-0" }),
				"Disconnected",
			),
		);
	}

	return React.createElement(
		"header",
		{
			className: "bg-surface-container border-b border-outline-variant flex justify-between items-center w-full px-md h-14 sticky top-0 z-30",
		},
		React.createElement(
			"div",
			{ className: "flex items-center gap-sm" },
			React.createElement("span", { className: "font-label-caps text-label-caps tracking-widest text-primary hidden-sm" }, "VPS_MANAGER"),
			React.createElement(
				"button",
				{
					className: "md:hidden text-on-surface-variant p-xs rounded hover:bg-surface-variant",
					onClick: handleToggleSidebar,
				},
				React.createElement("span", { className: "material-symbols-outlined" }, "menu"),
			),
		),
		React.createElement(
			"div",
			{ className: "flex items-center gap-md" },
			React.createElement(
				"div",
				{ className: "flex items-center gap-xs px-sm py-xs bg-surface-variant rounded border border-outline-variant" },
				React.createElement("div", { className: "status-dot" }),
				React.createElement("span", { className: "font-code-block text-code-block text-on-surface" }, host),
			),
			React.createElement(
				"div",
				{ className: "flex gap-xs text-on-surface-variant" },
				React.createElement(
					"button",
					{
						className: "hover:bg-surface-variant transition-colors p-xs rounded",
						title: "Refresh VPS data",
						onClick: handleRefreshStatus,
					},
					React.createElement("span", { className: "material-symbols-outlined" }, "sensors"),
				),
			),
		),
	);
}
