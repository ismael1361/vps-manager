/* ================================================
   VPS Manager — Addon view sandbox runner
   ================================================ */
import { api } from "./api.js";
import { appendTerminalLine } from "./terminal.js";
import { escHtml } from "./utils.js";

// ---- Cleanup reference ----
var currentViewCleanup = null;

export function cleanupCurrentView() {
	if (currentViewCleanup) {
		currentViewCleanup();
		currentViewCleanup = null;
	}
}

// ---- Base styles injected into every shadow root ----
var ADDON_VIEW_BASE_STYLES = [
	":host { display:block; color:#dde4dd; font-family:'Geist',sans-serif; font-size:14px; line-height:20px; }",
	"h1 { font-size:24px; font-weight:600; line-height:32px; margin-bottom:8px; }",
	"h2 { font-size:20px; font-weight:600; line-height:28px; margin-top:16px; margin-bottom:8px; }",
	"p  { color:#bbcabf; margin-bottom:8px; }",
	"ul { list-style:disc; padding-left:20px; margin-bottom:8px; }",
	"li { margin-bottom:4px; }",
	"form { display:flex; flex-direction:column; gap:12px; max-width:520px; }",
	"label { display:block; font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; color:#bbcabf; margin-bottom:4px; }",
	"input[type=text],input[type=number],input[type=password],select,textarea {",
	"  width:100%; background:#1a211d; border:1px solid #3c4a42; border-radius:2px;",
	"  color:#dde4dd; font-family:'JetBrains Mono',monospace; font-size:13px; line-height:20px;",
	"  padding:8px 10px; outline:none; box-sizing:border-box; transition:border-color .15s; }",
	"input:focus,select:focus,textarea:focus { border-color:#4edea3; box-shadow:0 0 0 1px #4edea3; }",
	"textarea { resize:vertical; min-height:120px; }",
	"button[type=submit],button:not([class]) {",
	"  display:inline-flex; align-items:center; gap:6px;",
	"  background:#4edea3; color:#003824;",
	"  font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;",
	"  letter-spacing:0.05em; text-transform:uppercase;",
	"  padding:8px 20px; border:none; border-radius:2px; cursor:pointer;",
	"  transition:background-color .15s; margin-top:4px; align-self:flex-start; }",
	"button[type=submit]:hover,button:not([class]):hover { background:#6ffbbe; }",
	"::-webkit-scrollbar { width:6px; height:6px; }",
	"::-webkit-scrollbar-track { background:#09100c; }",
	"::-webkit-scrollbar-thumb { background:#2f3632; border-radius:3px; }",
	"::-webkit-scrollbar-thumb:hover { background:#3c4a42; }",
].join("\n");

// ---- Parsing helpers ----
function parseViewContent(contentArray) {
	var joined = Array.isArray(contentArray) ? contentArray.join("\n") : String(contentArray || "");

	function extractOne(tag) {
		var re = new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i");
		var m = joined.match(re);
		return m ? m[1].replace(/^\n/, "").replace(/\n$/, "") : "";
	}

	// Extract ALL <template> blocks, each with an optional `if` attribute
	var templates = [];
	var tplRe = /<template(?:\s+if="([^"]*)")?>([\s\S]*?)<\/template>/gi;
	var m;
	while ((m = tplRe.exec(joined)) !== null) {
		templates.push({ condition: m[1] || null, html: m[2].replace(/^\n/, "").replace(/\n$/, "") });
	}
	if (templates.length === 0) {
		templates.push({ condition: null, html: "" });
	}

	return { script: extractOne("script"), templates: templates, style: extractOne("style") };
}

function extractFunctionNames(src) {
	var names = {};
	var re1 = /\bfunction\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
	var re2 = /\b(?:var|let|const)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?(?:function|\()/g;
	var m;
	while ((m = re1.exec(src)) !== null) names[m[1]] = true;
	while ((m = re2.exec(src)) !== null) names[m[1]] = true;
	return Object.keys(names);
}

function interpolateTemplate(tmpl, evalInScope) {
	function tryEval(expr) {
		var trimmed = expr.trim();
		if (!trimmed) return null;
		try {
			var result = evalInScope(trimmed);
			return result == null ? "" : String(result);
		} catch (_) {
			return null;
		}
	}
	// First pass: {{expr}} double-brace syntax
	var out = tmpl.replace(/\{\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}\}/g, function (match, expr) {
		var val = tryEval(expr);
		return val !== null ? val : match;
	});
	// Second pass: {expr} single-brace syntax
	out = out.replace(/\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g, function (match, expr) {
		var val = tryEval(expr);
		return val !== null ? val : match;
	});
	return out;
}

// ---- Main runner ----
export function runAddonView(viewDef, addonName, container) {
	cleanupCurrentView();

	var ctxId = "_vctx" + Date.now();
	var parts = parseViewContent(viewDef.content);
	var scriptContent = parts.script;
	var templates = parts.templates;
	var styleContent = parts.style;

	// Shadow DOM — true style isolation
	var shadowHost = document.createElement("div");
	container.innerHTML = "";
	container.appendChild(shadowHost);
	var shadowRoot = shadowHost.attachShadow({ mode: "open" });

	function executeTrigger(triggerName, inputs) {
		inputs = inputs || {};
		appendTerminalLine({ type: "info", text: "▶ " + addonName + ":" + triggerName });
		return api
			.executeTrigger(addonName, triggerName, inputs)
			.then(function (result) {
				if (Array.isArray(result.commands)) {
					result.commands.forEach(function (cmd) {
						appendTerminalLine({ type: "command", text: "$ " + cmd });
					});
				}
				if (result.stdout) appendTerminalLine({ type: "stdout", text: result.stdout });
				if (result.stderr) appendTerminalLine({ type: "stderr", text: result.stderr });
				if (!result.stdout && !result.stderr) appendTerminalLine({ type: "success", text: "✓ done" });
				return result.stdout || result.stderr || "";
			})
			.catch(function (err) {
				appendTerminalLine({ type: "error", text: "✗ " + err.message });
				throw err;
			});
	}

	var transformed = scriptContent.replace(/\blet\b/g, "var").replace(/\bconst\b/g, "var");
	var funcNames = extractFunctionNames(scriptContent);
	var exportParts = funcNames.map(function (n) {
		return "'" + n + "':(typeof " + n + "!=='undefined'?" + n + ":undefined)";
	});
	var exportExpr = "{" + exportParts.join(",") + "}";

	// __exposeCtx__ first so evalInScope is set before any top-level await
	var scriptBody = "__exposeCtx__(function(e){return eval(e);}, " + exportExpr + ");\n" + transformed;

	var evalInScope = null;

	function renderView() {
		if (!evalInScope) return;

		var html = templates
			.map(function (tpl) {
				if (tpl.condition !== null) {
					try {
						if (!evalInScope(tpl.condition)) return "";
					} catch (_) {
						return "";
					}
				}
				return interpolateTemplate(tpl.html, evalInScope);
			})
			.join("");

		// Rewrite inline event handlers to use global registry
		if (funcNames.length > 0) {
			html = html.replace(/(\s)(on\w+)="([^"]+)"/g, function (_, sp, attr, handler) {
				var rewritten = handler;
				funcNames.forEach(function (n) {
					rewritten = rewritten.replace(new RegExp("\\b" + n + "\\b", "g"), "window['" + ctxId + "']." + n);
				});
				return sp + attr + '="' + rewritten + '"';
			});
		}

		var combinedStyle = ADDON_VIEW_BASE_STYLES + (styleContent ? "\n" + styleContent : "");
		shadowRoot.innerHTML = "<style>" + combinedStyle + "</style>" + html;
	}

	try {
		// eslint-disable-next-line no-new-func
		var AsyncFunction = async function () {}.constructor;
		var fn = new AsyncFunction("executeTrigger", "render", "__exposeCtx__", scriptBody);
		fn(executeTrigger, renderView, function (evalFn, funcMap) {
			evalInScope = evalFn;
			var registry = Object.assign({}, funcMap, { executeTrigger: executeTrigger });
			window[ctxId] = registry;
			renderView();
		}).catch(function (err) {
			appendTerminalLine({ type: "error", text: "View runtime error: " + err.message });
		});
	} catch (err) {
		container.innerHTML = '<div class="p-md text-error font-code-block text-code-block">View error: ' + escHtml(err.message) + "</div>";
	}

	currentViewCleanup = function () {
		delete window[ctxId];
		container.innerHTML = "";
	};
}
