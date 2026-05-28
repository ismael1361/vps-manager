const DEFAULT_CONSOLE_LINE = "Aguardando eventos...";
const RAW_TRIGGER_VIEW = "__trigger__";
const ADDON_VIEW_SOURCE = "vps-manager-addon-view";
const ADDON_HOST_SOURCE = "vps-manager-addon-host";

const state = {
	session: null,
	addons: [],
	installedAddons: [],
	vpsStatus: null,
	route: "login",
	previousRoute: "library",
	selectedAddonName: "",
	selectedTriggerName: "",
	selectedAddonViewName: RAW_TRIGGER_VIEW,
	triggerInputs: {},
	preview: null,
	authMethod: "password",
	loginForm: {
		host: "",
		port: "22",
		username: "root",
		password: "",
		privateKey: "",
		privateKeyFileName: "",
		passphrase: "",
	},
	notice: {
		message: "Carregando painel...",
		tone: "neutral",
	},
	consoleLines: [DEFAULT_CONSOLE_LINE],
	eventSource: null,
	installedCheckedAt: "",
	statusCheckedAt: "",
};

const root = document.getElementById("app");

const ROUTE_META = {
	status: {
		title: "Status da VPS",
		description: "Resumo operacional da máquina remota, estado da sessão SSH e métricas básicas do host.",
		icon: "dashboard",
	},
	library: {
		title: "Biblioteca de add-ons",
		description: "Catálogo completo de add-ons do pacote e da pasta local para instalar, consultar ou executar ações.",
		icon: "extension",
	},
	installed: {
		title: "Add-ons instalados",
		description: "Itens detectados na VPS conectada com base em pacotes Debian ou Ubuntu compatíveis com os manifestos.",
		icon: "inventory_2",
	},
	addon: {
		title: "Detalhes do add-on",
		description: "Tela operacional do add-on selecionado, com triggers, preview de comandos e console de execução.",
		icon: "tune",
	},
	logs: {
		title: "Execuções",
		description: "Console em tempo real com stdout, stderr e eventos emitidos pelo backend durante as execuções.",
		icon: "terminal",
	},
};

function escapeHtml(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function icon(name, options = {}) {
	const className = options.className ? ` ${options.className}` : "";
	const filled = options.filled ? " is-filled" : "";
	return `<span class="material-symbols-outlined${filled}${className}" aria-hidden="true">${escapeHtml(name)}</span>`;
}

function isConnected() {
	return state.session?.connected === true;
}

function formatDateTime(value) {
	if (!value) {
		return "Não verificado";
	}

	return new Date(value).toLocaleString("pt-BR");
}

function getRouteMeta() {
	if (state.route === "addon") {
		const addon = getSelectedAddon();
		if (addon) {
			return {
				title: addon.addon.name,
				description: addon.addon.description,
				icon: getAddonIcon(addon.addon.name),
			};
		}
	}

	return ROUTE_META[state.route] || ROUTE_META.status;
}

function getAddonIcon(name) {
	const normalizedName = String(name || "").toLowerCase();

	if (normalizedName.includes("nginx")) {
		return "dns";
	}

	if (normalizedName.includes("docker")) {
		return "view_in_ar";
	}

	if (normalizedName.includes("mysql") || normalizedName.includes("postgres") || normalizedName.includes("maria")) {
		return "database";
	}

	if (normalizedName.includes("redis") || normalizedName.includes("memcached")) {
		return "memory";
	}

	if (normalizedName.includes("node")) {
		return "javascript";
	}

	return "extension";
}

function getActiveRoute() {
	if (state.route === "addon") {
		return state.previousRoute === "installed" ? "installed" : "library";
	}

	return state.route;
}

function getStatusLabel() {
	if (!isConnected()) {
		return "offline";
	}

	return state.session?.busy ? "ocupado" : "online";
}

function statusClass() {
	if (!isConnected()) {
		return "status-chip status-chip--offline";
	}

	if (state.session?.busy) {
		return "status-chip status-chip--busy";
	}

	return "status-chip status-chip--online";
}

function setNotice(message, tone = "neutral") {
	state.notice = { message, tone };
	render();
}

function appendConsole(message) {
	if (!message) {
		return;
	}

	if (state.consoleLines.length === 1 && state.consoleLines[0] === DEFAULT_CONSOLE_LINE) {
		state.consoleLines = [];
	}

	state.consoleLines.push(message);
	if (state.consoleLines.length > 240) {
		state.consoleLines.splice(0, state.consoleLines.length - 240);
	}

	syncConsole();
}

function clearConsole() {
	state.consoleLines = [];
	syncConsole();
}

function syncConsole() {
	const consoleElement = root.querySelector("[data-console-output]");
	if (!consoleElement) {
		return;
	}

	consoleElement.innerHTML = renderConsoleOutput();
	consoleElement.scrollTop = consoleElement.scrollHeight;
}

function getInstalledMap() {
	return new Map(state.installedAddons.map((entry) => [entry.addon.name, entry]));
}

function getSelectedAddon() {
	return state.addons.find((entry) => entry.addon.name === state.selectedAddonName) || null;
}

function getSelectedTrigger() {
	const addon = getSelectedAddon();
	if (!addon) {
		return null;
	}

	return addon.addon.triggers.find((trigger) => trigger.name === state.selectedTriggerName) || null;
}

function getSelectedAddonView() {
	const addon = getSelectedAddon();
	if (!addon || !addon.addon.views?.length || state.selectedAddonViewName === RAW_TRIGGER_VIEW) {
		return null;
	}

	return addon.addon.views.find((view) => view.name === state.selectedAddonViewName) || null;
}

function getTerminalPrompt() {
	return `${state.session?.username || "root"}@${state.session?.host || "localhost"}:~#`;
}

function getConsoleDisplayLines() {
	if (state.consoleLines.length === 1 && state.consoleLines[0] === DEFAULT_CONSOLE_LINE) {
		return [];
	}

	return state.consoleLines;
}

function getConsoleLineTone(line) {
	if (line.startsWith("$ ")) {
		return "console-line--command";
	}

	if (line.startsWith("[stderr]") || line.startsWith("# error")) {
		return "console-line--error";
	}

	if (line.startsWith("[exit ")) {
		return "console-line--meta";
	}

	if (line.startsWith("# ")) {
		return "console-line--notice";
	}

	return "console-line--output";
}

function renderConsoleOutput() {
	const lines = getConsoleDisplayLines();
	const content = lines.length
		? lines
				.map(
					(line, index) => `
						<div class="console-line ${getConsoleLineTone(line)}">
							<span class="console-line__number">${index + 1}</span>
							<span class="console-line__text">${escapeHtml(line)}</span>
						</div>
					`,
				)
				.join("")
		: `
			<div class="console-line console-line--placeholder">
				<span class="console-line__number">1</span>
				<span class="console-line__text">Terminal limpo para a página atual.</span>
			</div>
		`;

	return `
		<div class="console-stack">
			${content}
			<div class="console-line console-line--cursor">
				<span class="console-line__number">${lines.length + 1}</span>
				<span class="console-line__text"><span class="console-cursor"></span></span>
			</div>
		</div>
	`;
}

function resetObservationConsole() {
	state.consoleLines = [];
	syncConsole();
}

function getAddonViewIcon(name) {
	const normalized = String(name || "").toLowerCase();
	if (normalized.includes("dashboard")) {
		return "dashboard";
	}
	if (normalized.includes("create") || normalized.includes("new")) {
		return "add_box";
	}
	if (normalized.includes("status")) {
		return "monitoring";
	}
	return "web";
}

function getTriggerIcon(name) {
	const normalized = String(name || "").toLowerCase();
	const iconMap = {
		install: "download",
		ufw_allow: "security",
		uninstall: "delete",
		status: "monitoring",
		restart: "restart_alt",
		reload: "sync",
		enable: "toggle_on",
		disable: "toggle_off",
		list_sites: "list_alt",
		list_enabled_sites: "fact_check",
		create_site: "public",
		delete_site: "delete_forever",
		read_site: "description",
		edit_site: "edit_square",
		test_configuration: "rule",
	};

	return iconMap[normalized] || "play_arrow";
}

function getAddonTitle(addon) {
	if (!addon) {
		return "Add-on";
	}

	if (addon.addon.name.toLowerCase().includes("nginx")) {
		return "Nginx Web Server";
	}

	return addon.addon.name;
}

function getAddonNavigationEntries(addon) {
	if (!addon) {
		return [];
	}

	const viewEntries = (addon.addon.views || []).map((view) => ({
		kind: "view",
		name: view.name,
		label: view.name,
		icon: getAddonViewIcon(view.name),
		view,
	}));

	const triggerEntries = addon.addon.triggers.map((trigger) => ({
		kind: "trigger",
		name: trigger.name,
		label: formatTriggerLabel(trigger.name),
		icon: getTriggerIcon(trigger.name),
		trigger,
	}));

	return [...viewEntries, ...triggerEntries];
}

function getActiveAddonEntry(addon) {
	const view = getSelectedAddonView();
	if (view) {
		return {
			kind: "view",
			name: view.name,
			label: view.name,
			icon: getAddonViewIcon(view.name),
			view,
		};
	}

	const trigger = getSelectedTrigger();
	if (!addon || !trigger) {
		return null;
	}

	return {
		kind: "trigger",
		name: trigger.name,
		label: formatTriggerLabel(trigger.name),
		icon: getTriggerIcon(trigger.name),
		trigger,
	};
}

function formatTriggerLabel(name) {
	const normalizedName = String(name || "").trim();
	const overrides = {
		ufw_allow: "Allow HTTP/HTTPS (UFW)",
		list_sites: "List Sites",
		list_enabled_sites: "List Enabled Sites",
		create_site: "Create Site",
		delete_site: "Delete Site",
		read_site: "Read Site",
		edit_site: "Edit Site",
		test_configuration: "Test Configuration",
	};

	if (overrides[normalizedName]) {
		return overrides[normalizedName];
	}

	return normalizedName
		.split(/[_-]+/)
		.filter(Boolean)
		.map((chunk) => {
			const lower = chunk.toLowerCase();
			if (lower === "ufw") {
				return "UFW";
			}
			if (lower === "nginx") {
				return "Nginx";
			}
			if (lower === "http") {
				return "HTTP";
			}
			if (lower === "https") {
				return "HTTPS";
			}

			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(" ");
}

function getResolvedPreview() {
	const addon = getSelectedAddon();
	const trigger = getSelectedTrigger();
	if (!addon || !trigger || !state.preview) {
		return null;
	}

	if (state.preview.addonName !== addon.addon.name || state.preview.triggerName !== trigger.name) {
		return null;
	}

	return state.preview;
}

function getPreviewText() {
	const preview = getResolvedPreview();
	return preview ? preview.commands.join("\n") : "Use Pré-visualizar para resolver os comandos com os parâmetros atuais.";
}

function normalizeSelections() {
	if (!getSelectedAddon() && state.addons.length > 0) {
		state.selectedAddonName = state.addons[0].addon.name;
	}

	const selectedAddon = getSelectedAddon();
	if (!selectedAddon) {
		state.selectedAddonName = "";
		state.selectedTriggerName = "";
		state.selectedAddonViewName = RAW_TRIGGER_VIEW;
		return;
	}

	if (!selectedAddon.addon.triggers.some((trigger) => trigger.name === state.selectedTriggerName)) {
		state.selectedTriggerName = selectedAddon.addon.triggers[0]?.name || "";
		state.triggerInputs = {};
		state.preview = null;
	}

	if (!selectedAddon.addon.views?.length) {
		state.selectedAddonViewName = RAW_TRIGGER_VIEW;
		return;
	}

	if (state.selectedAddonViewName === RAW_TRIGGER_VIEW) {
		return;
	}

	if (!selectedAddon.addon.views.some((view) => view.name === state.selectedAddonViewName)) {
		state.selectedAddonViewName = selectedAddon.addon.views[0]?.name || RAW_TRIGGER_VIEW;
	}
}

function navigate(route) {
	if (route !== "addon") {
		state.previousRoute = route;
	}

	state.route = route;
	render();
}

function openAddon(addonName, originRoute = state.route) {
	state.selectedAddonName = addonName;
	state.selectedAddonViewName = "";
	normalizeSelections();
	state.previousRoute = originRoute === "addon" ? state.previousRoute : originRoute;
	state.route = "addon";
	state.preview = null;
	resetObservationConsole();
	render();
}

function renderFlash() {
	if (!state.notice.message) {
		return "";
	}

	return `<div class="flash flash--${escapeHtml(state.notice.tone)}">${escapeHtml(state.notice.message)}</div>`;
}

function renderMetricCard(title, value, note, iconName) {
	return `
		<article class="metric-card">
			<div class="metric-card__head">
				<span class="mini-label">${escapeHtml(title)}</span>
				${icon(iconName, { filled: true })}
			</div>
			<div class="metric-card__value">${escapeHtml(value)}</div>
			<p class="metric-card__note">${escapeHtml(note)}</p>
		</article>
	`;
}

function renderEmptyState(title, copy, action) {
	return `
		<section class="surface-panel empty-state">
			${icon("empty_dashboard")}
			<h3>${escapeHtml(title)}</h3>
			<p class="empty-copy">${escapeHtml(copy)}</p>
			${action || ""}
		</section>
	`;
}

function renderAddonTile(entry, installedEntry, originRoute) {
	const installed = Boolean(installedEntry);
	const actionLabel = installed ? "Gerenciar" : "Abrir add-on";
	const versionLabel = installed && installedEntry.remoteVersion ? installedEntry.remoteVersion : `manifesto ${entry.addon.version}`;
	const viewsCount = entry.addon.views?.length || 0;

	return `
		<article class="addon-tile">
			<div class="addon-tile__header">
				<div class="addon-glyph">${icon(getAddonIcon(entry.addon.name), { filled: true })}</div>
				<span class="version-badge">${escapeHtml(versionLabel)}</span>
			</div>
			<div class="addon-tile__body">
				<h3>${escapeHtml(entry.addon.name)}</h3>
				<p class="card-copy">${escapeHtml(entry.addon.description)}</p>
			</div>
			<div class="addon-tile__meta">
				<span class="subtle-tag">${icon("bolt")} ${entry.addon.triggers.length} trigger(s)</span>
				${viewsCount ? `<span class="subtle-tag">${icon("dashboard")} ${viewsCount} view(s)</span>` : ""}
				${installed ? `<span class="subtle-tag subtle-tag--success">${icon("check_circle", { filled: true })} instalado</span>` : `<span class="subtle-tag">${icon("download")} disponível</span>`}
			</div>
			<button class="tile-action" type="button" data-action="open-addon" data-addon-name="${escapeHtml(entry.addon.name)}" data-origin="${escapeHtml(originRoute)}">${escapeHtml(actionLabel)}</button>
		</article>
	`;
}

function extractAddonViewBlock(content, tagName) {
	const expression = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	return Array.from(content.matchAll(expression))
		.map((match) => match[1].trim())
		.filter(Boolean)
		.join("\n\n");
}

function stripAddonViewBlocks(content) {
	return content
		.replace(/<script>[\s\S]*?<\/script>/gi, "")
		.replace(/<template>[\s\S]*?<\/template>/gi, "")
		.replace(/<style>[\s\S]*?<\/style>/gi, "")
		.trim();
}

function buildAddonViewDocument(addonEntry, view) {
	const content = view.content.join("\n");
	const template = extractAddonViewBlock(content, "template");
	const script = extractAddonViewBlock(content, "script");
	const styles = extractAddonViewBlock(content, "style");
	const staticMarkup = stripAddonViewBlocks(content);

	return `<!doctype html>
<html lang="pt-BR">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		:root {
			color-scheme: dark;
			font-family: "Geist", "Segoe UI", sans-serif;
		}
		body {
			margin: 0;
			padding: 18px;
			background: transparent;
			color: #dde4dd;
			font-family: "Geist", "Segoe UI", sans-serif;
		}
		h1, h2, h3, p {
			margin-top: 0;
		}
		p {
			line-height: 1.6;
			color: #bbcabf;
		}
		form {
			display: grid;
			gap: 12px;
		}
		label {
			display: grid;
			gap: 8px;
			font-size: 12px;
			font-family: "JetBrains Mono", Consolas, monospace;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: #bbcabf;
		}
		input, textarea, button {
			font: inherit;
		}
		input, textarea {
			width: 100%;
			padding: 12px 14px;
			border-radius: 14px;
			border: 1px solid rgba(255, 255, 255, 0.08);
			background: rgba(11, 18, 14, 0.82);
			color: #dde4dd;
			box-sizing: border-box;
		}
		button {
			padding: 12px 16px;
			border: 0;
			border-radius: 14px;
			background: linear-gradient(135deg, #4edea3, #10b981);
			color: #002113;
			font-family: "JetBrains Mono", Consolas, monospace;
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			cursor: pointer;
		}
		ul {
			margin: 0;
			padding-left: 18px;
			color: #dde4dd;
		}
		.addon-view-error {
			padding: 14px;
			border-radius: 14px;
			background: rgba(255, 180, 171, 0.14);
			color: #ffb4ab;
			white-space: pre-wrap;
		}
		${styles}
	</style>
</head>
<body>
	<div id="addon-view-root">${staticMarkup}</div>
	<script>
		const __template = ${JSON.stringify(template)};
		const __addonName = ${JSON.stringify(addonEntry.addon.name)};
		const __viewName = ${JSON.stringify(view.name)};
		const __root = document.getElementById("addon-view-root");
		const __pending = new Map();

		function __request(type, triggerName, inputs) {
			const requestId = String(Date.now()) + "-" + Math.random().toString(16).slice(2);
			return new Promise((resolve, reject) => {
				__pending.set(requestId, { resolve, reject, type });
				window.parent.postMessage(
					{
						source: ${JSON.stringify(ADDON_VIEW_SOURCE)},
						requestId,
						type,
						addonName: __addonName,
						viewName: __viewName,
						triggerName,
						inputs: inputs || {},
					},
					"*",
				);
			});
		}

		window.addEventListener("message", (event) => {
			const data = event.data;
			if (!data || data.source !== ${JSON.stringify(ADDON_HOST_SOURCE)}) {
				return;
			}

			const pending = __pending.get(data.requestId);
			if (!pending) {
				return;
			}

			__pending.delete(data.requestId);
			if (data.ok) {
				pending.resolve(pending.type === "execute-trigger" ? data.payload.stdout || "" : data.payload);
				return;
			}

			pending.reject(new Error(data.error || "Falha ao executar trigger da view."));
		});

		async function executeTrigger(triggerName, inputs) {
			return __request("execute-trigger", triggerName, inputs);
		}

		async function previewTrigger(triggerName, inputs) {
			return __request("preview-trigger", triggerName, inputs);
		}

		function __notifyHeight() {
			const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
			window.parent.postMessage(
				{
					source: ${JSON.stringify(ADDON_VIEW_SOURCE)},
					type: "view-resize",
					addonName: __addonName,
					viewName: __viewName,
					height,
				},
				"*",
			);
		}

		function __renderTemplate() {
			if (!__template) {
				__notifyHeight();
				return;
			}

			const html = __template
				.split(/\r?\n/)
				.map((line) => {
					const trimmed = line.trim();
					if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
						return line;
					}

					try {
						const value = eval(trimmed.slice(1, -1));
						return line.replace(trimmed, value == null ? "" : String(value));
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						return line.replace(trimmed, '<pre class="addon-view-error">' + message + '</pre>');
					}
				})
				.join("\n");

			__root.innerHTML = html;
			__notifyHeight();
		}

		function render() {
			__renderTemplate();
		}

		window.render = render;
		window.addEventListener("load", __notifyHeight);
		if (typeof ResizeObserver === "function") {
			new ResizeObserver(__notifyHeight).observe(document.body);
		}
		${script}
		if (__template) {
			render();
		} else {
			__notifyHeight();
		}
	</script>
</body>
</html>`;
}

function renderStatusChipMarkup() {
	return `<span class="${statusClass()}" data-status-chip>${escapeHtml(getStatusLabel())}</span>`;
}

function renderAddonInstalledBadge(addon, installedEntry) {
	return installedEntry
		? `<span class="addon-installed-badge addon-installed-badge--installed" data-addon-installed-badge>${icon("check_circle", { filled: true })} Installed</span>`
		: `<span class="addon-installed-badge" data-addon-installed-badge>${icon("info")} Not detected</span>`;
}

function renderAddonPreviewInline() {
	const selectedView = getSelectedAddonView();
	if (selectedView) {
		return "";
	}

	const preview = getResolvedPreview();
	if (!preview) {
		return "";
	}

	return `
		<div class="addon-inline-preview__card">
			<div class="addon-inline-preview__header">
				<span class="mini-label">Resolved Commands</span>
				<button class="terminal-action" type="button" data-action="copy-preview">${icon("content_copy")} Copy</button>
			</div>
			<pre class="console console--compact">${escapeHtml(getPreviewText())}</pre>
			${preview.warnings.length ? `<div class="flash flash--warning addon-inline-preview__warning">${escapeHtml(preview.warnings.join(" "))}</div>` : ""}
		</div>
	`;
}

function renderTriggerEditor(trigger) {
	return `
		<form class="form-grid addon-inline-form" data-form="trigger">
			${
				trigger.input?.length
					? trigger.input
							.map((input) => {
								const value = state.triggerInputs[input.name] || "";
								const useTextarea = input.placeholder && input.placeholder.includes("\n");

								if (useTextarea) {
									return `
										<label class="field">
											<span class="field__label">${escapeHtml(input.name)}</span>
											<div class="input-shell input-shell--multiline">
												${icon("notes", { className: "field__icon" })}
												<textarea class="field__control" data-scope="trigger" name="${escapeHtml(input.name)}" rows="8" placeholder="${escapeHtml(input.placeholder || "")}">${escapeHtml(value)}</textarea>
											</div>
										</label>
									`;
								}

								return `
									<label class="field">
										<span class="field__label">${escapeHtml(input.name)}</span>
										<div class="input-shell">
											${icon("edit_square", { className: "field__icon" })}
											<input class="field__control" data-scope="trigger" name="${escapeHtml(input.name)}" type="${escapeHtml(input.type || "text")}" placeholder="${escapeHtml(input.placeholder || "")}" value="${escapeHtml(value)}" />
										</div>
									</label>
								`;
							})
							.join("")
					: `<div class="fact-card"><dt>Nenhum parâmetro</dt><dd>Este trigger pode ser executado imediatamente.</dd></div>`
			}
			<div class="addon-inline-actions">
				<button class="primary-cta addon-inline-actions__primary" type="submit">${icon("bolt", { filled: true })} Execute</button>
				<button class="addon-inline-actions__secondary" type="button" data-action="preview-trigger" aria-label="Pré-visualizar trigger">${icon("code")}</button>
			</div>
			<div class="addon-inline-preview" data-addon-preview>${renderAddonPreviewInline()}</div>
		</form>
	`;
}

function renderAddonActionItem(addon, entry, isActive) {
	const actionAttributes =
		entry.kind === "view" ? `data-action="select-addon-view" data-view-name="${escapeHtml(entry.name)}"` : `data-action="select-trigger" data-trigger-name="${escapeHtml(entry.name)}"`;
	const meta = entry.kind === "view" ? "Página customizada do add-on" : entry.trigger.input?.length ? `${entry.trigger.input.length} campo(s)` : "Execução imediata";
	const header = `
		<button class="trigger-item__toggle" type="button" ${actionAttributes}>
			<div class="trigger-item__lead">
				<span class="trigger-item__glyph">${icon(entry.icon, { filled: isActive })}</span>
				<div>
					<span class="trigger-item__title">${escapeHtml(entry.label)}</span>
					<span class="trigger-item__meta">${escapeHtml(meta)}</span>
				</div>
			</div>
			${icon(isActive ? "keyboard_arrow_down" : "play_arrow")}
		</button>
	`;

	if (!isActive) {
		return `
			<div class="trigger-item">
				${header}
			</div>
		`;
	}

	return `
		<div class="trigger-item is-active">
			${header}
			<div class="trigger-item__body">
				${
					entry.kind === "view"
						? `<div class="addon-view-shell"><iframe class="addon-view-frame" data-addon-view-frame title="${escapeHtml(entry.label)}" srcdoc="${escapeHtml(buildAddonViewDocument(addon, entry.view))}"></iframe></div>`
						: renderTriggerEditor(entry.trigger)
				}
			</div>
		</div>
	`;
}

function renderTopbar() {
	const meta = getRouteMeta();

	return `
		<header class="topbar">
			<div class="topbar__brand">
				<div class="brand-lockup">${icon("terminal", { filled: true })}<strong>VPS_MANAGER</strong></div>
				<div class="topbar__page">
					${icon(meta.icon || ROUTE_META.status.icon, { filled: true })}
					<div class="topbar__page-copy">
						<strong>${escapeHtml(meta.title)}</strong>
						<span>${escapeHtml(state.session?.username || "guest")}@${escapeHtml(state.session?.host || "localhost")}</span>
					</div>
				</div>
			</div>
			<div class="topbar__tools">
				${renderStatusChipMarkup()}
				<div class="topbar__toolset">
					<button class="icon-button" type="button" data-action="refresh-status" aria-label="Atualizar status">${icon("sensors")}</button>
					<button class="icon-button" type="button" data-action="refresh-installed" aria-label="Atualizar instalados">${icon("sync_alt")}</button>
				</div>
			</div>
		</header>
	`;
}

function renderLogin() {
	const usingPassword = state.authMethod === "password";
	const privateKeyFileBadge = state.loginForm.privateKeyFileName
		? `<span class="mini-badge mini-badge--success">${icon("draft", { filled: true })} ${escapeHtml(state.loginForm.privateKeyFileName)}</span>`
		: `<span class="mini-badge">${icon("draft")} nenhum arquivo anexado</span>`;

	return `
		<div class="login-screen">
			<header class="topbar">
				<div class="topbar__brand">
					<div class="brand-lockup">${icon("terminal", { filled: true })}<strong>VPS_MANAGER</strong></div>
					<div class="topbar__page">
						${icon("lock", { filled: true })}
						<div class="topbar__page-copy">
							<strong>Autenticação SSH</strong>
							<span>Conecte primeiro. O dashboard abre após a sessão ser validada.</span>
						</div>
					</div>
				</div>
				<div class="topbar__tools">
					<span class="status-chip status-chip--offline">desconectado</span>
					<div class="topbar__toolset">
						<span class="icon-button is-static">${icon("sensors")}</span>
						<span class="icon-button is-static">${icon("settings")}</span>
					</div>
				</div>
			</header>

			<main class="login-canvas">
				<div class="login-layout">
					<section class="auth-panel">
						<div class="auth-header">
							<p class="eyebrow">new connection</p>
							<div>
								<h1>Conecte sua VPS</h1>
								<p class="section-copy">Fluxo em duas etapas: login via SSH e, após a validação, entrada imediata no dashboard com biblioteca de add-ons, instalados, status da VPS e execuções.</p>
							</div>
						</div>

						${renderFlash()}

						<form class="stack" data-form="login">
							<div class="field-grid">
								<label class="field field-span-7">
									<span class="field__label">Host</span>
									<div class="input-shell">
										${icon("dns", { className: "field__icon" })}
										<input class="field__control" data-scope="login" name="host" type="text" placeholder="203.0.113.10 ou servidor.exemplo.com" value="${escapeHtml(state.loginForm.host)}" required />
									</div>
								</label>
								<label class="field field-span-3">
									<span class="field__label">Porta</span>
									<div class="input-shell">
										${icon("router", { className: "field__icon" })}
										<input class="field__control" data-scope="login" name="port" type="number" min="1" max="65535" value="${escapeHtml(state.loginForm.port)}" required />
									</div>
								</label>
								<label class="field field-span-5">
									<span class="field__label">Usuário</span>
									<div class="input-shell">
										${icon("person", { className: "field__icon" })}
										<input class="field__control" data-scope="login" name="username" type="text" value="${escapeHtml(state.loginForm.username)}" required />
									</div>
								</label>
							</div>

							<div class="auth-method-panel">
								<div class="auth-method-panel__header">
									<span class="field__label">Método de autenticação</span>
									<div class="segmented-control" role="tablist" aria-label="Método de autenticação SSH">
										<button class="tab-button ${usingPassword ? "is-active" : ""}" type="button" data-action="set-auth-method" data-auth-method="password">Senha</button>
										<button class="tab-button ${!usingPassword ? "is-active" : ""}" type="button" data-action="set-auth-method" data-auth-method="privateKey">Chave privada</button>
									</div>
								</div>

								${
									usingPassword
										? `
											<label class="field">
												<span class="field__label">Senha</span>
												<div class="input-shell">
													${icon("key", { className: "field__icon" })}
													<input class="field__control" data-scope="login" name="password" type="password" placeholder="Senha do usuário SSH" value="${escapeHtml(state.loginForm.password)}" />
												</div>
											</label>
										`
										: `
											<div class="auth-private-key-grid">
												<label class="field auth-private-key-grid__editor">
													<span class="field__label">Private key</span>
													<div class="input-shell input-shell--multiline">
														${icon("key", { className: "field__icon" })}
														<textarea class="field__control" data-scope="login" name="privateKey" rows="8" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----">${escapeHtml(state.loginForm.privateKey)}</textarea>
													</div>
												</label>
												<div class="private-key-tools">
													<div class="private-key-tools__actions">
														<label class="secondary-cta file-picker" for="private-key-file">${icon("upload_file")} Anexar arquivo</label>
														${privateKeyFileBadge}
													</div>
													<input class="sr-only" id="private-key-file" data-scope="login-file" name="privateKeyFile" type="file" />
													<p class="field__hint">Cole a chave diretamente ou escolha um arquivo local. O conteúdo é lido no navegador e enviado como texto na conexão.</p>
												</div>
											</div>
											<label class="field">
												<span class="field__label">Passphrase</span>
												<div class="input-shell">
													${icon("password", { className: "field__icon" })}
													<input class="field__control" data-scope="login" name="passphrase" type="password" placeholder="Opcional" value="${escapeHtml(state.loginForm.passphrase)}" />
												</div>
											</label>
										`
								}
							</div>

							<div class="footer-actions">
								<button class="primary-cta is-block" type="submit">${icon("terminal", { filled: true })} Conectar e abrir dashboard</button>
							</div>
						</form>
					</section>

					<aside class="tips-column">
						<section class="tip-card">
							<div>
								<p class="kicker">onboarding tips</p>
								<h3>Boas práticas antes de conectar</h3>
							</div>
							<div class="tip-list">
								<div class="tip-item">
									${icon("admin_panel_settings")}
									<div>
										<strong>Contexto de usuário</strong>
										<p class="soft-copy">Use root ou um usuário com sudo sem senha. Isso evita bloqueios em triggers que elevam privilégio.</p>
									</div>
								</div>
								<div class="tip-item">
									${icon("security")}
									<div>
										<strong>Chaves são preferíveis</strong>
										<p class="soft-copy">Para produção, Ed25519 costuma ser a escolha mais segura e conveniente para conexões automatizadas.</p>
									</div>
								</div>
								<div class="tip-item">
									${icon("network_ping")}
									<div>
										<strong>Porta customizada</strong>
										<p class="soft-copy">Se o provedor expõe SSH fora da porta 22, ajuste antes de conectar para evitar falsos erros de autenticação.</p>
									</div>
								</div>
							</div>
						</section>

						<section class="tip-card snippet-card">
							<div>
								<p class="kicker">session preview</p>
								<h3>O painel local fica aqui</h3>
								<p class="snippet-copy">Assim que a VPS aceitar a conexão, a navegação troca para um dashboard persistente com biblioteca, instalados, status e console.</p>
							</div>
							<pre>> ssh root@203.0.113.10
The authenticity of host '203.0.113.10' can't be established.
ED25519 key fingerprint is SHA256:xxxx/yyyy.
Are you sure you want to continue connecting? yes
Welcome to Ubuntu 24.04 LTS
Last login: Thu May 23 09:42:18 2026
root@vps-prod-01:~#</pre>
						</section>
					</aside>
				</div>
			</main>
		</div>
	`;
}

function renderSidebar() {
	const menuItems = [
		["status", "dashboard", "Status da VPS", "Visão geral, uptime, disco, memória e sessão SSH"],
		["library", "extension", "Biblioteca de add-ons", "Catálogo completo disponível para esta instalação"],
		["installed", "inventory_2", "Add-ons instalados", "Itens detectados diretamente na VPS conectada"],
		["logs", "terminal", "Execuções", "Console da sessão com stdout, stderr e eventos"],
	];

	const activeRoute = getActiveRoute();

	return `
		<aside class="side-nav">
			<div class="side-nav__profile">
				<div class="brand-mark">VM</div>
				<div>
					<h1>${escapeHtml(state.session?.username || "Root User")}</h1>
					<p>${escapeHtml(state.session?.host || "localhost")}</p>
				</div>
			</div>

			<button class="primary-cta" type="button" data-action="disconnect">${icon("add", { filled: true })} Nova conexão</button>

			<nav class="nav-list">
				${menuItems
					.map(
						([route, iconName, title, meta]) => `
							<button class="nav-item ${activeRoute === route ? "is-active" : ""}" type="button" data-action="navigate" data-route="${route}">
								<span class="nav-item__icon">${icon(iconName, { filled: activeRoute === route })}</span>
								<span>
									<span class="nav-label">${escapeHtml(title)}</span>
									<span class="nav-meta">${escapeHtml(meta)}</span>
								</span>
							</button>
						`,
					)
					.join("")}
			</nav>

			<div class="side-nav__footer">
				<button class="secondary-cta" type="button" data-action="refresh-status">${icon("sensors")} Atualizar status</button>
				<button class="secondary-cta" type="button" data-action="refresh-installed">${icon("autorenew")} Atualizar instalados</button>
				<button class="secondary-cta" type="button" data-action="disconnect">${icon("logout")} Encerrar sessão</button>
			</div>
		</aside>
	`;
}

function renderDashboardHeader() {
	const meta = getRouteMeta();
	if (state.route === "addon") {
		return "";
	}

	return `
		<section class="page-intro">
			<div class="intro-copy">
				<p class="eyebrow">dashboard</p>
				<h2>${escapeHtml(meta.title)}</h2>
				<p class="section-copy">${escapeHtml(meta.description)}</p>
			</div>
			<div class="intro-chips">
				<span class="tag">${icon(meta.icon, { filled: true })} ${escapeHtml(meta.title)}</span>
				<span class="tag">${icon("person")} ${escapeHtml(state.session?.username || "-")}</span>
				<span class="tag">${icon("dns")} ${escapeHtml(state.session?.host || "-")}</span>
				<span class="tag">${icon("schedule")} ${escapeHtml(formatDateTime(state.session?.connectedAt))}</span>
			</div>
		</section>
	`;
}

function renderSessionGrid(snapshot) {
	const facts = [
		["Host", snapshot.host || "-"],
		["Usuário", snapshot.username || "-"],
		["Porta", snapshot.port || "-"],
		["Autenticação", snapshot.authMethod || "-"],
		["Distribuição", snapshot.capabilities?.distro || "-"],
		["whoami", snapshot.capabilities?.whoami || "-"],
		["Root", snapshot.capabilities?.isRoot ? "sim" : "não"],
		["sudo sem senha", snapshot.capabilities?.canUseSudoWithoutPassword ? "sim" : "não"],
	];

	return `
		<dl class="facts-grid">
			${facts
				.map(
					([label, value]) => `
						<div class="fact-card">
							<dt>${escapeHtml(label)}</dt>
							<dd>${escapeHtml(value)}</dd>
						</div>
					`,
				)
				.join("")}
		</dl>
	`;
}

function renderStatusView() {
	const snapshot = state.session || { connected: false, busy: false };
	const system = state.vpsStatus?.system || {};
	const installedCount = state.installedAddons.length;
	const capabilityLabel = snapshot.capabilities?.isRoot ? "root" : snapshot.capabilities?.canUseSudoWithoutPassword ? "sudo pronto" : "sudo bloqueado";

	return `
		<div class="detail-stack">
			<section class="stats-grid">
				${renderMetricCard("Hostname", system.hostname || snapshot.host || "-", "Identificação principal do host remoto.", "dns")}
				${renderMetricCard("Uptime", system.uptime || "-", "Tempo ligado na última leitura sob demanda.", "schedule")}
				${renderMetricCard("Load avg", system.load || "-", "Três médias de carga lidas de /proc/loadavg.", "monitoring")}
				${renderMetricCard("Memória", system.memory || "-", "Consumo atual retornado pelo free -m.", "memory")}
				${renderMetricCard("Disco raiz", system.disk || "-", "Uso atual da partição raiz reportado por df -h /.", "hard_drive")}
				${renderMetricCard("Add-ons detectados", installedCount || "0", "Quantidade de manifestos encontrados também como pacote remoto.", "extension")}
			</section>

			<section class="status-detail-grid">
				<article class="surface-panel session-card">
					<div class="session-header">
						<div>
							<p class="kicker">ssh session</p>
							<h3>Contexto da conexão</h3>
							<p class="section-copy">Estado atual da sessão em memória, com as capacidades detectadas no host remoto.</p>
						</div>
						<span class="${statusClass()}">${escapeHtml(getStatusLabel())}</span>
					</div>
					${renderSessionGrid(snapshot)}
				</article>

				<article class="surface-panel detail-card">
					<div class="session-header">
						<div>
							<p class="kicker">host status</p>
							<h3>Leitura operacional</h3>
							<p class="section-copy">Resumo pontual da VPS. O backend consulta essas informações apenas quando você pede atualização.</p>
						</div>
						<span class="mini-badge">${escapeHtml(formatDateTime(state.statusCheckedAt))}</span>
					</div>

					<div class="facts-grid">
						<div class="fact-card">
							<dt>Kernel</dt>
							<dd>${escapeHtml(system.kernel || "-")}</dd>
						</div>
						<div class="fact-card">
							<dt>Distribuição</dt>
							<dd>${escapeHtml(snapshot.capabilities?.distro || "-")}</dd>
						</div>
						<div class="fact-card">
							<dt>Acesso elevado</dt>
							<dd>${escapeHtml(capabilityLabel)}</dd>
						</div>
						<div class="fact-card">
							<dt>Última verificação de instalados</dt>
							<dd>${escapeHtml(formatDateTime(state.installedCheckedAt))}</dd>
						</div>
					</div>

					<div class="button-row">
						<button class="secondary-cta" type="button" data-action="refresh-status">${icon("sensors")} Atualizar status</button>
						<button class="secondary-cta" type="button" data-action="refresh-installed">${icon("sync_alt")} Atualizar instalados</button>
					</div>
				</article>
			</section>
		</div>
	`;
}

function renderLibraryView() {
	const installedMap = getInstalledMap();

	if (state.addons.length === 0) {
		return renderEmptyState(
			"Biblioteca vazia",
			"Nenhum add-on foi encontrado nas pastas addons do pacote ou do diretório atual.",
			`<button class="secondary-cta" type="button" data-action="refresh-library">${icon("refresh")} Atualizar catálogo</button>`,
		);
	}

	return `
		<section class="surface-panel">
			<div class="section-head">
				<div>
					<p class="kicker">catalog</p>
					<h3>Biblioteca disponível</h3>
					<p class="section-copy">Abra um add-on para visualizar triggers, parâmetros aceitos e comandos resolvidos antes da execução.</p>
				</div>
				<div class="button-row">
					<span class="mini-badge">${state.addons.length} item(ns)</span>
					<button class="secondary-cta" type="button" data-action="refresh-library">${icon("refresh")} Atualizar catálogo</button>
				</div>
			</div>

			<div class="addon-grid">
				${state.addons.map((entry) => renderAddonTile(entry, installedMap.get(entry.addon.name), "library")).join("")}
			</div>
		</section>
	`;
}

function renderInstalledView() {
	if (state.installedAddons.length === 0) {
		return renderEmptyState(
			"Nenhum add-on detectado",
			"A heurística atual usa nomes de pacotes Debian ou Ubuntu iguais aos nomes dos add-ons. Atualize a leitura depois de instalar algo novo.",
			`<button class="secondary-cta" type="button" data-action="refresh-installed">${icon("autorenew")} Atualizar instalados</button>`,
		);
	}

	return `
		<section class="surface-panel">
			<div class="section-head">
				<div>
					<p class="kicker">installed set</p>
					<h3>Add-ons detectados na VPS</h3>
					<p class="section-copy">Última verificação: ${escapeHtml(formatDateTime(state.installedCheckedAt))}. Os itens abaixo já foram reconhecidos no host remoto.</p>
				</div>
				<div class="button-row">
					<span class="mini-badge mini-badge--success">${state.installedAddons.length} detectado(s)</span>
					<button class="secondary-cta" type="button" data-action="refresh-installed">${icon("autorenew")} Atualizar instalados</button>
				</div>
			</div>

			<div class="addon-grid">
				${state.installedAddons.map((entry) => renderAddonTile(entry, entry, "installed")).join("")}
			</div>
		</section>
	`;
}

function renderAddonView() {
	const addon = getSelectedAddon();
	const activeEntry = getActiveAddonEntry(addon);
	const installedEntry = addon ? getInstalledMap().get(addon.addon.name) : null;

	if (!addon || !activeEntry) {
		return renderEmptyState(
			"Add-on não selecionado",
			"Volte para a biblioteca ou para a lista de instalados e escolha um add-on para abrir a tela operacional.",
			`<button class="secondary-cta" type="button" data-action="go-back">${icon("arrow_back")} Voltar</button>`,
		);
	}

	const navigationEntries = getAddonNavigationEntries(addon);

	return `
		<div class="addon-detail-page">
			<section class="addon-detail-header">
				<div class="breadcrumb">
					<span>Add-ons</span>
					${icon("chevron_right")}
					<strong>${escapeHtml(addon.addon.name)}</strong>
				</div>
				<div class="addon-detail-header__row">
					<h2 class="addon-detail-title">
						${escapeHtml(getAddonTitle(addon))}
						${renderAddonInstalledBadge(addon, installedEntry)}
					</h2>
					<div class="chip-row">
						<span class="tag">${icon("deployed_code")} manifesto ${escapeHtml(addon.addon.version)}</span>
						<button class="secondary-cta" type="button" data-action="go-back">${icon("arrow_back")} Voltar</button>
					</div>
				</div>
				<p class="section-copy addon-detail-copy">${escapeHtml(addon.addon.description)}</p>
			</section>

			<section class="addon-detail-grid">
				<div class="addon-detail-sidebar">
					<article class="surface-panel addon-actions-panel">
						<div class="section-head addon-actions-panel__header">
						<div>
							<p class="kicker">available actions</p>
							<h3>Available Actions</h3>
							<p class="section-copy">Selecione uma página ou trigger operacional do add-on.</p>
						</div>
						<span class="mini-badge">${navigationEntries.length} item(ns)</span>
					</div>
					<div class="trigger-list">
						${navigationEntries.map((entry) => renderAddonActionItem(addon, entry, entry.kind === activeEntry.kind && entry.name === activeEntry.name)).join("")}
					</div>
					</article>
				</div>

				<article class="terminal-card addon-terminal-card">
						<div class="terminal-card__header">
							<div class="terminal-card__identity">
								<span class="material-symbols-outlined" aria-hidden="true">terminal</span>
								<span class="terminal-meta" data-terminal-meta>${escapeHtml(getTerminalPrompt())}</span>
							</div>
							<div class="terminal-card__actions">
								<button class="terminal-action" type="button" data-action="copy-console">${icon("content_copy")} Copiar</button>
								<button class="terminal-action" type="button" data-action="clear-console">${icon("clear_all")} Limpar</button>
							</div>
						</div>
						<div class="addon-terminal-toolbar">
							<span class="mini-badge">Observando</span>
							<strong data-addon-observation-context>${escapeHtml(activeEntry.label)}</strong>
						</div>
						<div class="console" data-console-output>${renderConsoleOutput()}</div>
					</article>
			</section>
		</div>
	`;
}

function renderLogsView() {
	return `
		<section class="terminal-card">
			<div class="terminal-card__header">
				<div class="terminal-card__identity">
					<span class="material-symbols-outlined" aria-hidden="true">terminal</span>
					<span class="terminal-meta" data-terminal-meta>${escapeHtml(getTerminalPrompt())}</span>
				</div>
				<div class="terminal-card__actions">
					<button class="terminal-action" type="button" data-action="copy-console">${icon("content_copy")} Copiar</button>
					<button class="terminal-action" type="button" data-action="clear-console">${icon("clear_all")} Limpar</button>
				</div>
			</div>
			<div class="console" data-console-output>${renderConsoleOutput()}</div>
		</section>
	`;
}

function renderCurrentView() {
	switch (state.route) {
		case "status":
			return renderStatusView();
		case "library":
			return renderLibraryView();
		case "installed":
			return renderInstalledView();
		case "addon":
			return renderAddonView();
		case "logs":
			return renderLogsView();
		default:
			return renderStatusView();
	}
}

function renderDashboard() {
	return `
		<div class="dashboard-shell">
			${renderSidebar()}
			<div class="workspace-shell">
				${renderTopbar()}
				<main class="page-canvas">
					${renderDashboardHeader()}
					<div data-flash-slot>${renderFlash()}</div>
					${renderCurrentView()}
				</main>
			</div>
		</div>
	`;
}

function getRenderSignature() {
	return JSON.stringify({
		connected: isConnected(),
		route: state.route,
		authMethod: state.authMethod,
		selectedAddonName: state.selectedAddonName,
		selectedTriggerName: state.selectedTriggerName,
		selectedAddonViewName: state.selectedAddonViewName,
	});
}

function syncFlash() {
	const flashSlot = root.querySelector("[data-flash-slot]");
	if (!flashSlot) {
		return;
	}

	flashSlot.innerHTML = renderFlash();
}

function syncStatusChip() {
	const statusChip = root.querySelector("[data-status-chip]");
	if (!statusChip) {
		return;
	}

	statusChip.outerHTML = renderStatusChipMarkup();
}

function syncTerminalMeta() {
	const prompt = getTerminalPrompt();
	for (const element of root.querySelectorAll("[data-terminal-meta]")) {
		element.textContent = prompt;
	}

	const activeEntry = getActiveAddonEntry(getSelectedAddon());
	for (const element of root.querySelectorAll("[data-addon-observation-context]")) {
		element.textContent = activeEntry?.label || "Sem seleção";
	}
}

function syncAddonInstalledBadge() {
	const addon = getSelectedAddon();
	const badge = root.querySelector("[data-addon-installed-badge]");
	if (!addon || !badge) {
		return;
	}

	badge.outerHTML = renderAddonInstalledBadge(addon, getInstalledMap().get(addon.addon.name));
}

function syncAddonPreview() {
	const preview = root.querySelector("[data-addon-preview]");
	if (!preview) {
		return;
	}

	preview.innerHTML = renderAddonPreviewInline();
}

function syncAddonSurface() {
	syncFlash();
	syncStatusChip();
	syncTerminalMeta();
	syncAddonInstalledBadge();
	syncAddonPreview();
	syncConsole();
}

function render() {
	if (!isConnected()) {
		state.route = "login";
	}

	normalizeSelections();
	document.title = isConnected() ? `VPS Manager - ${getRouteMeta().title}` : "VPS Manager - Login";
	const renderSignature = getRenderSignature();
	if (state.route === "addon" && root.dataset.renderSignature === renderSignature) {
		syncAddonSurface();
		return;
	}

	root.innerHTML = isConnected() ? renderDashboard() : renderLogin();
	root.dataset.renderSignature = renderSignature;
	syncConsole();
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, {
		headers: {
			"Content-Type": "application/json",
		},
		...options,
	});

	const json = await response.json();
	if (!response.ok) {
		throw new Error(json.message || `Request failed with status ${response.status}`);
	}

	return json;
}

function readFileAsText(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();

		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error("Não foi possível ler o arquivo de chave como texto."));
				return;
			}

			resolve(reader.result);
		};

		reader.onerror = () => {
			reject(reader.error || new Error("Falha ao ler o arquivo de chave privada."));
		};

		reader.readAsText(file);
	});
}

async function writeClipboard(text, successMessage) {
	if (!text) {
		return;
	}

	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
	} else {
		const probe = document.createElement("textarea");
		probe.value = text;
		probe.setAttribute("readonly", "readonly");
		probe.className = "sr-only";
		document.body.appendChild(probe);
		probe.select();
		document.execCommand("copy");
		probe.remove();
	}

	state.notice = {
		message: successMessage,
		tone: "success",
	};
	render();
}

async function refreshSession() {
	state.session = await fetchJson("/api/session");

	if (isConnected() && state.route === "login") {
		state.route = "status";
	}

	if (!isConnected()) {
		state.installedAddons = [];
		state.vpsStatus = null;
		state.installedCheckedAt = "";
		state.statusCheckedAt = "";
	}
}

async function loadAddons() {
	state.addons = await fetchJson("/api/addons");
	normalizeSelections();
}

async function loadInstalledAddons() {
	if (!isConnected()) {
		state.installedAddons = [];
		state.installedCheckedAt = "";
		return;
	}

	state.installedAddons = await fetchJson("/api/addons/installed");
	state.installedCheckedAt = new Date().toISOString();
}

async function loadVpsStatus() {
	if (!isConnected()) {
		state.vpsStatus = null;
		state.statusCheckedAt = "";
		return;
	}

	state.vpsStatus = await fetchJson("/api/vps/status");
	state.statusCheckedAt = new Date().toISOString();
}

async function hydrateConnectedState() {
	const results = await Promise.allSettled([loadInstalledAddons(), loadVpsStatus()]);
	for (const result of results) {
		if (result.status === "rejected") {
			console.error(result.reason);
		}
	}
}

async function connectSession() {
	const payload = {
		host: state.loginForm.host,
		port: Number(state.loginForm.port),
		username: state.loginForm.username,
		password: state.authMethod === "password" ? state.loginForm.password : undefined,
		privateKey: state.authMethod === "privateKey" ? state.loginForm.privateKey : undefined,
		passphrase: state.authMethod === "privateKey" ? state.loginForm.passphrase : undefined,
	};

	state.session = await fetchJson("/api/session/connect", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	state.route = "status";
	await hydrateConnectedState();
	appendConsole(`$ connected ${state.session.username}@${state.session.host}:${state.session.port}`);
	state.notice = {
		message: "Sessão SSH conectada. O dashboard principal foi carregado.",
		tone: state.session.capabilities?.isRoot || state.session.capabilities?.canUseSudoWithoutPassword ? "success" : "warning",
	};
	render();
}

async function disconnectSession() {
	state.session = await fetchJson("/api/session/disconnect", {
		method: "POST",
		body: JSON.stringify({}),
	});
	state.route = "login";
	state.vpsStatus = null;
	state.installedAddons = [];
	state.preview = null;
	appendConsole("$ disconnected");
	state.notice = {
		message: "Sessão SSH encerrada. Faça login novamente para abrir o dashboard.",
		tone: "neutral",
	};
	render();
}

async function previewSelectedTrigger() {
	const addon = getSelectedAddon();
	const trigger = getSelectedTrigger();

	if (!addon || !trigger) {
		throw new Error("Selecione um add-on e um trigger antes de gerar a pré-visualização.");
	}

	const preview = await fetchJson("/api/triggers/preview", {
		method: "POST",
		body: JSON.stringify({
			addonName: addon.addon.name,
			triggerName: trigger.name,
			inputs: state.triggerInputs,
		}),
	});

	state.preview = preview;
	state.notice = {
		message: preview.warnings.length ? preview.warnings.join(" ") : `Pré-visualização pronta para ${addon.addon.name}/${trigger.name}.`,
		tone: preview.warnings.length ? "warning" : "success",
	};
	render();
}

async function runSelectedTrigger() {
	const addon = getSelectedAddon();
	const trigger = getSelectedTrigger();

	if (!addon || !trigger) {
		throw new Error("Selecione um add-on e um trigger antes de executar.");
	}

	const result = await fetchJson("/api/triggers/run", {
		method: "POST",
		body: JSON.stringify({
			addonName: addon.addon.name,
			triggerName: trigger.name,
			inputs: state.triggerInputs,
		}),
	});

	appendConsole(`$ queued ${addon.addon.name}/${trigger.name} (${result.executionId})`);
	state.notice = {
		message: `Execução iniciada para ${addon.addon.name}/${trigger.name}.`,
		tone: "success",
	};
	await refreshSession();
	render();
}

async function executeAddonViewTrigger(addonName, triggerName, inputs = {}) {
	const result = await fetchJson("/api/triggers/execute", {
		method: "POST",
		body: JSON.stringify({
			addonName,
			triggerName,
			inputs,
		}),
	});

	appendConsole(`\n# ${addonName}/${triggerName} sync (${result.executionId})`);
	for (const output of result.outputs || []) {
		appendConsole(`$ ${output.command}`);
		if (output.stdout) {
			appendConsole(output.stdout.replace(/\n$/, ""));
		}
		if (output.stderr) {
			appendConsole(`[stderr] ${output.stderr.replace(/\n$/, "")}`);
		}
		appendConsole(`[exit ${output.code ?? "unknown"}] sync command`);
	}

	await refreshSession();
	await hydrateConnectedState();
	state.notice = {
		message: `${addonName}/${triggerName} executado pela view do add-on.`,
		tone: "success",
	};
	render();

	return result;
}

function postAddonViewBridgeResponse(targetWindow, requestId, payload, error) {
	targetWindow.postMessage(
		{
			source: ADDON_HOST_SOURCE,
			requestId,
			ok: !error,
			payload,
			error,
		},
		"*",
	);
}

async function handleAddonViewBridgeMessage(event) {
	const data = event.data;
	if (!data || data.source !== ADDON_VIEW_SOURCE) {
		return;
	}

	if (data.type === "view-resize") {
		const frame = root.querySelector("[data-addon-view-frame]");
		if (frame && Number.isFinite(data.height)) {
			frame.style.height = `${Math.max(260, Math.ceil(Number(data.height)) + 8)}px`;
		}
		return;
	}

	if (!data.requestId) {
		return;
	}

	const targetWindow = event.source;
	if (!targetWindow || typeof targetWindow.postMessage !== "function") {
		return;
	}

	try {
		let payload;

		switch (data.type) {
			case "execute-trigger":
				payload = await executeAddonViewTrigger(data.addonName, data.triggerName, data.inputs || {});
				break;
			case "preview-trigger":
				payload = await fetchJson("/api/triggers/preview", {
					method: "POST",
					body: JSON.stringify({
						addonName: data.addonName,
						triggerName: data.triggerName,
						inputs: data.inputs || {},
					}),
				});
				break;
			default:
				return;
		}

		postAddonViewBridgeResponse(targetWindow, data.requestId, payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		postAddonViewBridgeResponse(targetWindow, data.requestId, undefined, message);
		state.notice = {
			message,
			tone: "danger",
		};
		render();
	}
}

function connectEventStream() {
	if (state.eventSource) {
		state.eventSource.close();
	}

	const source = new EventSource("/api/stream");
	state.eventSource = source;

	source.addEventListener("stream:ready", () => {
		appendConsole("$ event stream ready");
	});

	source.addEventListener("session:changed", (event) => {
		const data = JSON.parse(event.data);
		state.session = data.payload;
		if (isConnected() && state.route === "login") {
			state.route = "status";
		}
		if (!isConnected()) {
			state.route = "login";
		}
		render();
	});

	source.addEventListener("execution:start", (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`\n# ${data.addonName}/${data.triggerName} started (${data.executionId})`);
	});

	source.addEventListener("command:start", (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`$ ${data.command}`);
	});

	source.addEventListener("command:stdout", (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(data.chunk.replace(/\n$/, ""));
	});

	source.addEventListener("command:stderr", (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`[stderr] ${data.chunk.replace(/\n$/, "")}`);
	});

	source.addEventListener("command:close", (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`[exit ${data.code ?? "unknown"}] command ${data.index + 1}`);
	});

	source.addEventListener("execution:complete", async (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`# ${data.addonName}/${data.triggerName} completed`);
		await refreshSession();
		await hydrateConnectedState();
		state.notice = {
			message: `${data.addonName}/${data.triggerName} concluído com sucesso.`,
			tone: "success",
		};
		render();
	});

	source.addEventListener("execution:error", async (event) => {
		const data = JSON.parse(event.data).payload;
		appendConsole(`# error: ${data.message}`);
		await refreshSession();
		state.notice = {
			message: data.message,
			tone: "danger",
		};
		render();
	});

	source.addEventListener("error", () => {
		state.notice = {
			message: "Falha no stream SSE. O navegador vai tentar reconectar automaticamente.",
			tone: "warning",
		};
		render();
	});
}

async function handleAction(event) {
	const target = event.target;
	if (!(target instanceof Element)) {
		return;
	}

	const actionElement = target.closest("[data-action]");
	if (!actionElement) {
		return;
	}

	const action = actionElement.dataset.action;

	switch (action) {
		case "navigate":
			navigate(actionElement.dataset.route);
			return;
		case "set-auth-method":
			state.authMethod = actionElement.dataset.authMethod === "privateKey" ? "privateKey" : "password";
			render();
			return;
		case "disconnect":
			await disconnectSession();
			return;
		case "refresh-library":
			await loadAddons();
			state.notice = { message: "Catálogo de add-ons atualizado.", tone: "success" };
			render();
			return;
		case "refresh-installed":
			await loadInstalledAddons();
			state.notice = { message: "Lista de add-ons instalados atualizada.", tone: "success" };
			render();
			return;
		case "refresh-status":
			await loadVpsStatus();
			state.notice = { message: "Status da VPS atualizado.", tone: "success" };
			render();
			return;
		case "open-addon":
			openAddon(actionElement.dataset.addonName, actionElement.dataset.origin || state.route);
			return;
		case "go-back":
			navigate(state.previousRoute || "library");
			return;
		case "select-addon-view":
			state.selectedAddonViewName = actionElement.dataset.viewName || RAW_TRIGGER_VIEW;
			state.preview = null;
			resetObservationConsole();
			render();
			return;
		case "select-trigger":
			state.selectedTriggerName = actionElement.dataset.triggerName || "";
			state.selectedAddonViewName = RAW_TRIGGER_VIEW;
			state.triggerInputs = {};
			state.preview = null;
			resetObservationConsole();
			render();
			return;
		case "preview-trigger":
			await previewSelectedTrigger();
			return;
		case "clear-console":
			clearConsole();
			return;
		case "copy-console":
			await writeClipboard(state.consoleLines.join("\n"), "Console copiado para a área de transferência.");
			return;
		case "copy-preview":
			await writeClipboard(getPreviewText(), "Preview copiado para a área de transferência.");
			return;
		default:
			return;
	}
}

async function handleSubmit(event) {
	const form = event.target;
	if (!(form instanceof HTMLFormElement)) {
		return;
	}

	if (form.dataset.form === "login") {
		event.preventDefault();
		await connectSession();
		return;
	}

	if (form.dataset.form === "trigger") {
		event.preventDefault();
		await runSelectedTrigger();
	}
}

function handleInput(event) {
	const field = event.target;
	if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
		return;
	}

	if (field.dataset.scope === "login") {
		state.loginForm[field.name] = field.value;
		if (field.name === "privateKey") {
			state.loginForm.privateKeyFileName = "";
		}
		return;
	}

	if (field.dataset.scope === "trigger") {
		state.triggerInputs[field.name] = field.value;
	}
}

async function handleChange(event) {
	const field = event.target;
	if (!(field instanceof HTMLInputElement)) {
		return;
	}

	if (field.dataset.scope !== "login-file" || field.type !== "file") {
		return;
	}

	const file = field.files?.[0];
	if (!file) {
		state.loginForm.privateKeyFileName = "";
		render();
		return;
	}

	const content = await readFileAsText(file);
	state.loginForm.privateKey = content;
	state.loginForm.privateKeyFileName = file.name;
	state.notice = {
		message: `Chave privada carregada de ${file.name}.`,
		tone: "success",
	};
	render();
}

root.addEventListener("click", (event) => {
	void handleAction(event).catch((error) => {
		setNotice(error instanceof Error ? error.message : String(error), "danger");
	});
});

root.addEventListener("submit", (event) => {
	void handleSubmit(event).catch((error) => {
		setNotice(error instanceof Error ? error.message : String(error), "danger");
	});
});

root.addEventListener("input", handleInput);

root.addEventListener("change", (event) => {
	void handleChange(event).catch((error) => {
		setNotice(error instanceof Error ? error.message : String(error), "danger");
	});
});

window.addEventListener("message", (event) => {
	void handleAddonViewBridgeMessage(event);
});

async function bootstrap() {
	render();
	connectEventStream();

	try {
		await Promise.all([refreshSession(), loadAddons()]);
		if (isConnected()) {
			state.route = "status";
			await hydrateConnectedState();
			state.notice = {
				message: "Sessão restaurada. Dashboard carregado com sucesso.",
				tone: "success",
			};
		} else {
			state.notice = {
				message: "Faça login na VPS para abrir o dashboard completo.",
				tone: "neutral",
			};
		}
	} catch (error) {
		state.notice = {
			message: error instanceof Error ? error.message : String(error),
			tone: "danger",
		};
	}

	render();
}

bootstrap();
