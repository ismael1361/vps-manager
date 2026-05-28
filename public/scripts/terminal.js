/* ================================================
   VPS Manager — Terminal output
   ================================================ */
import { state } from "./state.js";
import { escHtml } from "./utils.js";

export function appendTerminalLine(line) {
	line.id = Date.now() + Math.random();
	state.terminal.push(line);
	if (state.terminal.length > 600) state.terminal.shift();
	flushTerminal();
}

export function flushTerminal() {
	var el = document.getElementById("terminal-output");
	if (!el) return;
	el.innerHTML = buildTerminalHTML();
	el.scrollTop = el.scrollHeight;
}

export function buildTerminalHTML() {
	var lineNum = 0;
	return state.terminal
		.map(function (line) {
			var chunks = String(line.text).split("\n");
			return chunks
				.filter(function (c, i) {
					return i === 0 || c;
				})
				.map(function (chunk, ci) {
					lineNum++;
					var cls = "text-on-surface";
					var extra = "";
					if (line.type === "command") {
						cls = "text-outline";
						extra = ci === 0 ? "mt-sm" : "";
					} else if (line.type === "stderr") cls = "text-error";
					else if (line.type === "success") cls = "text-primary";
					else if (line.type === "error") cls = "text-tertiary";
					else if (line.type === "info") cls = "text-secondary";
					return (
						'<div class="flex gap-sm ' +
						extra +
						'">' +
						'<span class="select-none text-outline opacity-40 shrink-0" style="min-width:1.75rem;text-align:right">' +
						lineNum +
						"</span>" +
						'<span class="' +
						cls +
						' break-all">' +
						escHtml(chunk) +
						"</span>" +
						"</div>"
					);
				})
				.join("");
		})
		.join("");
}
