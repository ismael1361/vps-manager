/* ================================================
   VPS Manager — Componente Terminal (sem JSX)
   ================================================ */
import React, { useRef, useEffect } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { escHtml } from "../utils.js";

function buildLines(terminal) {
	var lineNum = 0;
	var elements = [];

	terminal.forEach(function (line) {
		var chunks = String(line.text).split("\n");
		chunks
			.filter(function (c, i) {
				return i === 0 || c;
			})
			.forEach(function (chunk, ci) {
				lineNum++;
				var cls = "text-on-surface";
				var extraClass = "";
				if (line.type === "command") {
					cls = "text-outline";
					extraClass = ci === 0 ? "mt-sm" : "";
				} else if (line.type === "stderr") cls = "text-error";
				else if (line.type === "success") cls = "text-primary";
				else if (line.type === "error") cls = "text-tertiary";
				else if (line.type === "info") cls = "text-secondary";

				elements.push(
					React.createElement(
						"div",
						{ key: line.id + "-" + ci, className: "flex gap-sm " + extraClass },
						React.createElement(
							"span",
							{
								className: "select-none text-outline opacity-40 shrink-0",
								style: { minWidth: "1.75rem", textAlign: "right" },
							},
							lineNum,
						),
						React.createElement("span", {
							className: cls + " break-all",
							dangerouslySetInnerHTML: { __html: escHtml(chunk) },
						}),
					),
				);
			});
	});

	return elements;
}

export function Terminal() {
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;
	var outputRef = useRef(null);
	var username = state.session.username || "root";
	var host = state.session.host || "—";

	// Auto-scroll ao receber novas linhas
	useEffect(
		function () {
			if (outputRef.current && state.terminalVisible) {
				outputRef.current.scrollTop = outputRef.current.scrollHeight;
			}
		},
		[state.terminal, state.terminalVisible],
	);

	function handleToggle() {
		dispatch({ type: "TOGGLE_TERMINAL" });
	}

	function handleClear() {
		dispatch({ type: "CLEAR_TERMINAL" });
	}

	function handleCopy() {
		var text = state.terminal
			.map(function (l) {
				return l.text;
			})
			.join("\n");
		navigator.clipboard.writeText(text).catch(function () {});
	}

	var panelHeight = state.terminalVisible ? "280px" : "44px";
	var toggleIcon = state.terminalVisible ? "expand_more" : "expand_less";

	return React.createElement(
		"div",
		{
			className: "flex flex-col border-t border-outline-variant bg-surface-container-low transition-all",
			style: { height: panelHeight },
		},
		React.createElement(
			"div",
			{ className: "flex items-center justify-between px-md h-11 shrink-0 cursor-default select-none" },
			React.createElement(
				"span",
				{
					className: "flex items-center gap-xs font-code-block text-code-block text-on-surface-variant",
					style: { fontSize: "11px" },
				},
				React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "14px" } }, "terminal"),
				username + "@" + host,
			),
			React.createElement(
				"div",
				{ className: "flex gap-xs" },
				React.createElement(
					"button",
					{
						className: "p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors",
						title: "Copy output",
						onClick: handleCopy,
					},
					React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "16px" } }, "content_copy"),
				),
				React.createElement(
					"button",
					{
						className: "p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors",
						title: "Clear",
						onClick: handleClear,
					},
					React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "16px" } }, "delete_sweep"),
				),
				React.createElement(
					"button",
					{
						className: "p-xs rounded hover:bg-surface-variant text-on-surface-variant transition-colors",
						title: "Toggle terminal",
						onClick: handleToggle,
					},
					React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "16px" } }, toggleIcon),
				),
			),
		),
		React.createElement(
			"div",
			{
				ref: outputRef,
				className: "flex-1 overflow-y-auto px-md pb-md font-code-block text-code-block",
				style: { fontSize: "12px", lineHeight: "18px" },
			},
			buildLines(state.terminal),
		),
	);
}
