/* ================================================
   VPS Manager — Addon view sandbox runner
   Adaptado para React: recebe appendLine como parâmetro
   ================================================ */
import { api } from "./api.js";
import { escHtml, getAddonId } from "./utils.js";

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
	"input[type=text],input[list],input[type=number],input[type=password],select,textarea {",
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

var ADDON_VIEW_RENDER_DEBOUNCE_MS = 16;

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

function resolveAddonRuntimeEntry(addonEntry) {
	var entry = addonEntry && addonEntry.addon ? addonEntry : { addon: addonEntry || {} };
	var addon = entry.addon || {};
	var addonId = entry.id || getAddonId(entry);

	return {
		entry: entry,
		addon: addon,
		addonId: addonId,
	};
}

function createHostAddonBridge(addonEntry, appendLine, dispatch) {
	if (typeof appendLine !== "function") appendLine = function () {};
	if (typeof dispatch !== "function") dispatch = function () {};

	var resolved = resolveAddonRuntimeEntry(addonEntry);
	var addon = resolved.addon;
	var addonId = resolved.addonId;

	function executeTrigger(triggerName, inputs) {
		inputs = inputs || {};
		appendLine({ type: "info", text: "▶ " + addon.name + ":" + triggerName });
		return api
			.executeTrigger(addon.name, triggerName, inputs)
			.then(function (result) {
				if (Array.isArray(result.commands)) {
					result.commands.forEach(function (cmd) {
						appendLine({ type: "command", text: "$ " + cmd });
					});
				}
				if (result.stdout) appendLine({ type: "stdout", text: result.stdout });
				if (result.stderr) appendLine({ type: "stderr", text: result.stderr });
				if (!result.stdout && !result.stderr) appendLine({ type: "success", text: "✓ done" });
				return result.stdout || result.stderr || "";
			})
			.catch(function (err) {
				appendLine({ type: "error", text: "✗ " + err.message });
				throw err;
			});
	}

	var $super = {
		readConfig: function () {
			return api.getAddonConfig(addonId);
		},
		updateConfig: function (changes) {
			return api.patchAddonConfig(addonId, { scope: changes }).then(function (entry) {
				dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: entry } });
				return entry;
			});
		},
		notify: function (message, type) {
			appendLine({ type: type || "info", text: String(message) });
			return Promise.resolve();
		},
		uninstall: function () {
			return api.removeAddonConfig(addonId).then(function () {
				dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: addonId, entry: null } });
				dispatch({ type: "NAVIGATE", payload: { page: "addons", addon: null, view: null } });
			});
		},
		requireAddon: function (depId) {
			return api.getAddonConfig(depId).then(function (cfg) {
				if (!cfg || cfg.state !== "installed") {
					throw new Error("Required addon '" + depId + "' is not installed.");
				}
				return cfg;
			});
		},
	};

	return {
		addon: addon,
		addonId: addonId,
		executeTrigger: executeTrigger,
		$super: $super,
	};
}

var ADDON_VIEW_IFRAME_SANDBOX = "allow-scripts allow-modals";
var ADDON_VIEW_IFRAME_MIN_HEIGHT_PX = 180;
var ADDON_VIEW_MESSAGE_TYPE = "vps-manager:addon-view";

function formatRuntimeError(error) {
	if (!error) return "Unknown error";
	return error && error.message ? error.message : String(error);
}

function createAddonViewBridgeId() {
	return "_vbridge" + Date.now() + Math.random().toString(16).slice(2);
}

function escapeInlineScriptText(value) {
	return String(value || "")
		.replace(/<\/(script)/gi, "<\\/$1")
		.replace(/<!--/g, "<\\!--");
}

function escapeInlineStyleText(value) {
	return String(value || "").replace(/<\/(style)/gi, "<\\/$1");
}

function buildAddonViewHostMethodMap(bridge) {
	return {
		"executeTrigger": bridge.executeTrigger,
		"super.readConfig": bridge.$super.readConfig,
		"super.updateConfig": bridge.$super.updateConfig,
		"super.notify": bridge.$super.notify,
		"super.uninstall": bridge.$super.uninstall,
		"super.requireAddon": bridge.$super.requireAddon,
	};
}

function buildAddonViewModuleScript(scriptContent, functionNames) {
	var exportParts = (functionNames || []).map(function (name) {
		return '"' + name + '":(typeof ' + name + ' !== "undefined" ? ' + name + " : undefined)";
	});

	return [String(scriptContent || ""), "", "window.__addonViewRuntime.registerFunctions({" + exportParts.join(",") + "});", "window.__addonViewRuntime.notifyReady();"].join("\n");
}

function buildAddonViewBootstrapScript() {
	return [
		"(function () {",
		"\tvar config = window.__ADDON_VIEW_CONFIG__ || {};",
		"\tvar root = document.getElementById('addon-view-root');",
		"\tvar templates = Array.isArray(config.templates) ? config.templates : [];",
		"\tvar registry = Object.create(null);",
		"\tvar state = {};",
		"\tvar renderTimer = null;",
		"\tvar requestSeq = 0;",
		"\tvar pendingRequests = Object.create(null);",
		"\tvar resizeObserver = null;",
		"\tvar messageType = config.messageType || 'vps-manager:addon-view';",
		"\tvar bridgeId = config.bridgeId;",
		"",
		"\tfunction formatError(error) {",
		"\t\tif (!error) return 'Unknown error';",
		"\t\treturn error && error.message ? error.message : String(error);",
		"\t}",
		"",
		"\tfunction postToParent(payload) {",
		"\t\twindow.parent.postMessage(Object.assign({ type: messageType, bridgeId: bridgeId }, payload), '*');",
		"\t}",
		"",
		"\tfunction reportError(stage, error) {",
		"\t\tpostToParent({ kind: 'runtime:error', stage: stage, message: formatError(error) });",
		"\t}",
		"",
		"\tfunction callHost(method, args) {",
		"\t\treturn new Promise(function (resolve, reject) {",
		"\t\t\trequestSeq += 1;",
		"\t\t\tvar requestId = 'req-' + requestSeq;",
		"\t\t\tpendingRequests[requestId] = { resolve: resolve, reject: reject };",
		"\t\t\tpostToParent({ kind: 'rpc:request', requestId: requestId, method: method, args: Array.isArray(args) ? args : [] });",
		"\t\t});",
		"\t}",
		"",
		"\tfunction getScope(extra) {",
		"\t\tvar scope = {",
		"\t\t\tstate: state,",
		"\t\t\trender: render,",
		"\t\t\tsetState: setState,",
		"\t\t\tgetState: getState,",
		"\t\t\texecuteTrigger: executeTrigger,",
		"\t\t\t$super: $super,",
		"\t\t\twindow: window,",
		"\t\t\tdocument: document,",
		"\t\t\tglobalThis: globalThis,",
		"\t\t\tconsole: console,",
		"\t\t\tMath: Math,",
		"\t\t\tDate: Date,",
		"\t\t\tJSON: JSON,",
		"\t\t\tArray: Array,",
		"\t\t\tObject: Object,",
		"\t\t\tNumber: Number,",
		"\t\t\tString: String,",
		"\t\t\tBoolean: Boolean,",
		"\t\t\tRegExp: RegExp,",
		"\t\t\tparseInt: parseInt,",
		"\t\t\tparseFloat: parseFloat,",
		"\t\t\tisNaN: isNaN,",
		"\t\t\tencodeURIComponent: encodeURIComponent,",
		"\t\t\tdecodeURIComponent: decodeURIComponent,",
		"\t\t\talert: window.alert.bind(window),",
		"\t\t\tconfirm: window.confirm.bind(window),",
		"\t\t\tprompt: window.prompt.bind(window),",
		"\t\t};",
		"\t\tvar names = Object.keys(registry);",
		"\t\tfor (var i = 0; i < names.length; i += 1) {",
		"\t\t\tscope[names[i]] = registry[names[i]];",
		"\t\t}",
		"\t\tif (extra && typeof extra === 'object') {",
		"\t\t\tvar extraKeys = Object.keys(extra);",
		"\t\t\tfor (var j = 0; j < extraKeys.length; j += 1) {",
		"\t\t\t\tscope[extraKeys[j]] = extra[extraKeys[j]];",
		"\t\t\t}",
		"\t\t}",
		"\t\treturn scope;",
		"\t}",
		"",
		"\tfunction tryEval(expression) {",
		"\t\tvar scope = getScope();",
		"\t\treturn Function('scope', 'with (scope) { return (' + expression + '); }')(scope);",
		"\t}",
		"",
		"\tfunction interpolateTemplate(template) {",
		"\t\tfunction replaceExpression(match, expression) {",
		"\t\t\tvar trimmed = expression.trim();",
		"\t\t\tif (!trimmed) return match;",
		"\t\t\ttry {",
		"\t\t\t\tvar value = tryEval(trimmed);",
		"\t\t\t\treturn value == null ? '' : String(value);",
		"\t\t\t} catch (_) {",
		"\t\t\t\treturn match;",
		"\t\t\t}",
		"\t\t}",
		"",
		"\t\treturn String(template || '')",
		"\t\t\t.replace(/\\{\\{((?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*)\\}\\}/g, replaceExpression)",
		"\t\t\t.replace(/\\{((?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*)\\}/g, replaceExpression);",
		"\t}",
		"",
		"\tfunction measureHeight() {",
		"\t\tvar body = document.body;",
		"\t\tvar docEl = document.documentElement;",
		"\t\tvar rootHeight = root ? root.scrollHeight : 0;",
		"\t\treturn Math.max(body ? body.scrollHeight : 0, docEl ? docEl.scrollHeight : 0, rootHeight, 1);",
		"\t}",
		"",
		"\tfunction postResize() {",
		"\t\tpostToParent({ kind: 'resize', height: measureHeight() });",
		"\t}",
		"",
		"\tfunction renderView() {",
		"\t\tif (!root) return;",
		"\t\tvar html = templates",
		"\t\t\t.map(function (tpl) {",
		"\t\t\t\tif (tpl && tpl.condition !== null && tpl.condition !== undefined) {",
		"\t\t\t\t\ttry {",
		"\t\t\t\t\t\tif (!tryEval(tpl.condition)) return '';",
		"\t\t\t\t\t} catch (_) {",
		"\t\t\t\t\t\treturn '';",
		"\t\t\t\t\t}",
		"\t\t\t\t}",
		"\t\t\t\treturn interpolateTemplate(tpl && tpl.html ? tpl.html : '');",
		"\t\t\t})",
		"\t\t\t.join('');",
		"\t\troot.innerHTML = html;",
		"\t\tpostResize();",
		"\t}",
		"",
		"\tfunction render() {",
		"\t\tif (renderTimer !== null) {",
		"\t\t\twindow.clearTimeout(renderTimer);",
		"\t\t\trenderTimer = null;",
		"\t\t}",
		"\t\trenderView();",
		"\t}",
		"",
		"\tfunction scheduleRender() {",
		"\t\tif (renderTimer !== null) return;",
		"\t\trenderTimer = window.setTimeout(function () {",
		"\t\t\trenderTimer = null;",
		"\t\t\trenderView();",
		"\t\t}, config.debounceMs || 16);",
		"\t}",
		"",
		"\tfunction getState(key, fallbackValue) {",
		"\t\tvar value = state[key];",
		"\t\treturn value === undefined ? fallbackValue : value;",
		"\t}",
		"",
		"\tfunction setState(key, value) {",
		"\t\tvar previousValue = state[key];",
		"\t\tvar nextValue = typeof value === 'function' ? value(previousValue) : value;",
		"\t\tstate[key] = nextValue;",
		"\t\tif (previousValue !== nextValue || typeof value === 'function') {",
		"\t\t\tscheduleRender();",
		"\t\t}",
		"\t\treturn nextValue;",
		"\t}",
		"",
		"\tfunction registerFunctions(funcMap) {",
		"\t\tfuncMap = funcMap || {};",
		"\t\tvar names = Object.keys(funcMap);",
		"\t\tfor (var i = 0; i < names.length; i += 1) {",
		"\t\t\tvar name = names[i];",
		"\t\t\tif (typeof funcMap[name] === 'function') {",
		"\t\t\t\tregistry[name] = funcMap[name];",
		"\t\t\t\twindow[name] = funcMap[name];",
		"\t\t\t}",
		"\t\t}",
		"\t\trender();",
		"\t}",
		"",
		"\tfunction notifyReady() {",
		"\t\tpostToParent({ kind: 'ready' });",
		"\t\trender();",
		"\t}",
		"",
		"\tvar executeTrigger = function (triggerName, inputs) {",
		"\t\treturn callHost('executeTrigger', [triggerName, inputs || {}]);",
		"\t};",
		"",
		"\tvar $super = {",
		"\t\treadConfig: function () { return callHost('super.readConfig', []); },",
		"\t\tupdateConfig: function (changes) { return callHost('super.updateConfig', [changes]); },",
		"\t\tnotify: function (message, type) { return callHost('super.notify', [message, type]); },",
		"\t\tuninstall: function () { return callHost('super.uninstall', []); },",
		"\t\trequireAddon: function (depId) { return callHost('super.requireAddon', [depId]); },",
		"\t};",
		"",
		"\twindow.addEventListener('message', function (event) {",
		"\t\tvar data = event.data || {};",
		"\t\tif (!data || data.type !== messageType || data.bridgeId !== bridgeId) return;",
		"\t\tif (data.kind !== 'rpc:response') return;",
		"\t\tvar request = pendingRequests[data.requestId];",
		"\t\tif (!request) return;",
		"\t\tdelete pendingRequests[data.requestId];",
		"\t\tif (data.success) request.resolve(data.result);",
		"\t\telse request.reject(new Error(data.error || 'Request failed'));",
		"\t});",
		"",
		"\twindow.addEventListener('error', function (event) {",
		"\t\treportError('window.error', event.error || event.message);",
		"\t});",
		"",
		"\twindow.addEventListener('unhandledrejection', function (event) {",
		"\t\treportError('window.unhandledrejection', event.reason);",
		"\t});",
		"",
		"\tif (typeof ResizeObserver === 'function') {",
		"\t\tresizeObserver = new ResizeObserver(function () {",
		"\t\t\tpostResize();",
		"\t\t});",
		"\t\tif (root) resizeObserver.observe(root);",
		"\t\tif (document.body) resizeObserver.observe(document.body);",
		"\t}",
		"",
		"\twindow.__addonViewRuntime = {",
		"\t\tstate: state,",
		"\t\tgetState: getState,",
		"\t\tsetState: setState,",
		"\t\trender: render,",
		"\t\texecuteTrigger: executeTrigger,",
		"\t\t$super: $super,",
		"\t\tregisterFunctions: registerFunctions,",
		"\t\tnotifyReady: notifyReady,",
		"\t\treportError: reportError,",
		"\t};",
		"",
		"\twindow.state = window.__addonViewRuntime.state;",
		"\twindow.setState = window.__addonViewRuntime.setState;",
		"\twindow.getState = window.__addonViewRuntime.getState;",
		"\twindow.render = window.__addonViewRuntime.render;",
		"\twindow.executeTrigger = window.__addonViewRuntime.executeTrigger;",
		"\twindow.$super = window.__addonViewRuntime.$super;",
		"",
		"\tpostResize();",
		"})();",
	].join("\n");
}

function buildAddonViewIframeDocument(options) {
	var config = {
		bridgeId: options.bridgeId,
		messageType: ADDON_VIEW_MESSAGE_TYPE,
		templates: options.templates || [],
		debounceMs: ADDON_VIEW_RENDER_DEBOUNCE_MS,
	};
	var moduleSource = buildAddonViewModuleScript(options.scriptContent, options.functionNames);

	return [
		"<!doctype html>",
		"<html>",
		"<head>",
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		"<style>",
		"html,body{margin:0;padding:0;background:transparent;color:#dde4dd;overflow:hidden;}",
		"body{min-height:100%;}",
		"#addon-view-root{display:block;min-height:1px;}",
		escapeInlineStyleText(ADDON_VIEW_BASE_STYLES),
		options.styleContent ? escapeInlineStyleText(options.styleContent) : "",
		"</style>",
		"</head>",
		"<body>",
		'<div id="addon-view-root"></div>',
		"<script>",
		"window.__ADDON_VIEW_CONFIG__ = " + escapeInlineScriptText(JSON.stringify(config)) + ";",
		escapeInlineScriptText(buildAddonViewBootstrapScript()),
		"</script>",
		'<script type="module">',
		escapeInlineScriptText(moduleSource),
		"</script>",
		"</body>",
		"</html>",
	].join("\n");
}

// ---- Main runner ----
export function runAddonView(viewDef, addonEntry, container, appendLine, dispatch) {
	if (typeof appendLine !== "function") appendLine = function () {};
	cleanupCurrentView();

	try {
		var resolved = resolveAddonRuntimeEntry(addonEntry);
		var addon = resolved.addon;
		var bridge = createHostAddonBridge(resolved.entry, appendLine, dispatch);
		var hostMethods = buildAddonViewHostMethodMap(bridge);
		var parts = parseViewContent(viewDef.content);
		var scriptContent = parts.script;
		var bridgeId = createAddonViewBridgeId();
		var iframe = document.createElement("iframe");
		var objectUrls = [];
		var disposed = false;

		iframe.setAttribute("sandbox", ADDON_VIEW_IFRAME_SANDBOX);
		iframe.setAttribute("title", (addon.name || "Addon") + " — " + (viewDef.name || "View"));
		iframe.setAttribute("scrolling", "no");
		iframe.style.width = "100%";
		iframe.style.border = "0";
		iframe.style.display = "block";
		iframe.style.background = "transparent";
		iframe.style.minHeight = ADDON_VIEW_IFRAME_MIN_HEIGHT_PX + "px";
		iframe.style.height = ADDON_VIEW_IFRAME_MIN_HEIGHT_PX + "px";

		function postToFrame(payload) {
			if (disposed || !iframe.contentWindow) return;
			iframe.contentWindow.postMessage(Object.assign({ type: ADDON_VIEW_MESSAGE_TYPE, bridgeId: bridgeId }, payload), "*");
		}

		function revokeObjectUrls() {
			while (objectUrls.length > 0) {
				URL.revokeObjectURL(objectUrls.pop());
			}
		}

		function respondToFrame(requestId, success, result, error) {
			postToFrame({
				kind: "rpc:response",
				requestId: requestId,
				success: success,
				result: result === undefined ? null : result,
				error: error || null,
			});
		}

		function handleMessage(event) {
			if (disposed || event.source !== iframe.contentWindow) return;

			var data = event.data || {};
			if (!data || data.type !== ADDON_VIEW_MESSAGE_TYPE || data.bridgeId !== bridgeId) return;

			if (data.kind === "resize") {
				var nextHeight = parseInt(data.height, 10);
				if (Number.isFinite(nextHeight) && nextHeight > 0) {
					iframe.style.height = Math.max(nextHeight, ADDON_VIEW_IFRAME_MIN_HEIGHT_PX) + "px";
				}
				return;
			}

			if (data.kind === "ready") {
				iframe.dataset.ready = "true";
				return;
			}

			if (data.kind === "runtime:error") {
				appendLine({ type: "error", text: "View runtime error: " + formatRuntimeError(data.message) });
				return;
			}

			if (data.kind !== "rpc:request") return;

			var handler = hostMethods[data.method];
			if (typeof handler !== "function") {
				respondToFrame(data.requestId, false, null, "Unsupported bridge method '" + data.method + "'.");
				return;
			}

			Promise.resolve()
				.then(function () {
					return handler.apply(null, Array.isArray(data.args) ? data.args : []);
				})
				.then(function (result) {
					respondToFrame(data.requestId, true, result, null);
				})
				.catch(function (error) {
					respondToFrame(data.requestId, false, null, formatRuntimeError(error));
				});
		}

		window.addEventListener("message", handleMessage);

		var html = buildAddonViewIframeDocument({
			bridgeId: bridgeId,
			templates: parts.templates,
			styleContent: parts.style,
			scriptContent: scriptContent,
			functionNames: extractFunctionNames(scriptContent),
		});
		var blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
		objectUrls.push(blobUrl);

		container.innerHTML = "";
		iframe.src = blobUrl;
		container.appendChild(iframe);

		currentViewCleanup = function () {
			disposed = true;
			window.removeEventListener("message", handleMessage);
			revokeObjectUrls();
			if (iframe && iframe.parentNode) {
				iframe.parentNode.removeChild(iframe);
			}
			container.innerHTML = "";
		};
	} catch (err) {
		container.innerHTML = '<div class="p-md text-error font-code-block text-code-block">View error: ' + escHtml(formatRuntimeError(err)) + "</div>";
	}
}

// ---- Lifecycle script runner ----

/**
 * Executes a named lifecycle function (install / initialize / uninstall / custom)
 * defined in an addon's root <script> block.
 *
 * The script receives:
 *   - executeTrigger(triggerName, inputs?) → Promise<string>
 *   - $super  → high-level operations (readConfig, updateConfig, notify, uninstall, requireAddon)
 *
 * @param {object}   addonEntry  - The addon entry object from the store (with .addon and .id)
 * @param {string}   fnName      - Name of the function to invoke ("install", "initialize", …)
 * @param {Function} appendLine  - appendLine({ type, text }) for terminal output
 * @param {Function} dispatch    - React dispatch for state changes
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export function runAddonLifecycle(addonEntry, fnName, appendLine, dispatch) {
	var bridge = createHostAddonBridge(addonEntry, appendLine, dispatch);
	var addon = bridge.addon;
	var scriptContent = addon.script;

	// If no lifecycle script defined, treat as immediate success
	if (!scriptContent || !scriptContent.trim()) {
		return Promise.resolve({ success: true });
	}

	var executeTrigger = bridge.executeTrigger;
	var $super = bridge.$super;

	var transformed = scriptContent.replace(/\blet\b/g, "var").replace(/\bconst\b/g, "var");
	var funcNames = extractFunctionNames(scriptContent);

	// Build: define all user functions, then expose the requested one
	var scriptBody = transformed + "\n" + "return (typeof " + fnName + " !== 'undefined' ? " + fnName + " : null);";

	return new Promise(function (resolve) {
		try {
			// eslint-disable-next-line no-new-func
			var AsyncFunction = async function () {}.constructor;
			var factory = new AsyncFunction("executeTrigger", "$super", scriptBody);
			factory(executeTrigger, $super)
				.then(function (fn) {
					if (typeof fn !== "function") {
						// Function not defined → treat as success (optional lifecycle hook)
						resolve({ success: true });
						return;
					}
					return fn();
				})
				.then(function () {
					resolve({ success: true });
				})
				.catch(function (err) {
					appendLine({ type: "error", text: "✗ " + fnName + "() failed: " + (err && err.message ? err.message : String(err)) });
					resolve({ success: false, error: err && err.message ? err.message : String(err) });
				});
		} catch (err) {
			appendLine({ type: "error", text: "✗ Script parse error: " + (err && err.message ? err.message : String(err)) });
			resolve({ success: false, error: err && err.message ? err.message : String(err) });
		}
	});
}
