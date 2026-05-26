const DEFAULT_CONSOLE_LINE = "Aguardando eventos...";

const state = {
	session: null,
	addons: [],
	installedAddons: [],
	vpsStatus: null,
	route: "login",
	previousRoute: "library",
	selectedAddonName: "",
	selectedTriggerName: "",
	triggerInputs: {},
	preview: null,
	authMethod: "password",
	loginForm: {
		host: "",
		port: "22",
		username: "root",
		password: "",
		privateKey: "",
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
		description: "Visão geral da sessão atual, distribuição, carga básica e estado operacional do host remoto.",
	},
	library: {
		title: "Biblioteca de add-ons",
		description: "Catálogo completo de add-ons disponíveis no pacote e na pasta addons do diretório atual.",
	},
	installed: {
		title: "Add-ons instalados",
		description: "Lista detectada na VPS com base em pacotes Debian/Ubuntu que possuem o mesmo nome do add-on.",
	},
	addon: {
		title: "Detalhes do add-on",
		description: "Visualize triggers, parâmetros e execute ações específicas do add-on selecionado.",
	},
	logs: {
		title: "Execuções",
		description: "Console em tempo real com stdout, stderr e eventos de execução emitidos pelo backend.",
	},
};

function escapeHtml(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
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
	state.consoleLines = [DEFAULT_CONSOLE_LINE];
	syncConsole();
	render();
}

function syncConsole() {
	const consoleElement = root.querySelector("[data-console-output]");
	if (!consoleElement) {
		return;
	}

	consoleElement.textContent = state.consoleLines.join("\n");
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

function normalizeSelections() {
	if (!getSelectedAddon() && state.addons.length > 0) {
		state.selectedAddonName = state.addons[0].addon.name;
	}

	const selectedAddon = getSelectedAddon();
	if (!selectedAddon) {
		state.selectedAddonName = "";
		state.selectedTriggerName = "";
		return;
	}

	if (!selectedAddon.addon.triggers.some((trigger) => trigger.name === state.selectedTriggerName)) {
		state.selectedTriggerName = selectedAddon.addon.triggers[0]?.name || "";
		state.triggerInputs = {};
		state.preview = null;
	}
}

function getRouteMeta() {
	if (state.route === "addon") {
		const addon = getSelectedAddon();
		if (addon) {
			return {
				title: addon.addon.name,
				description: addon.addon.description,
			};
		}
	}

	return ROUTE_META[state.route] || ROUTE_META.status;
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
	normalizeSelections();
	state.previousRoute = originRoute === "addon" ? state.previousRoute : originRoute;
	state.route = "addon";
	state.preview = null;
	render();
}

function statusClass() {
	if (!isConnected()) {
		return "status-pill is-idle";
	}

	if (state.session?.busy) {
		return "status-pill is-busy";
	}

	return "status-pill is-online";
}

function renderFlash() {
	if (!state.notice.message) {
		return "";
	}

	return `<div class="flash flash--${escapeHtml(state.notice.tone)}">${escapeHtml(state.notice.message)}</div>`;
}

function renderLogin() {
	const usingPassword = state.authMethod === "password";

	return `
		<div class="login-shell">
			<section class="login-hero">
				<div>
					<p class="eyebrow">localhost control plane</p>
					<h1>VPS Manager</h1>
					<p class="lead">Conecte na sua VPS por SSH e entre no dashboard para navegar entre biblioteca de add-ons, add-ons instalados, status da VPS e execuções.</p>
				</div>
				<div class="login-notes">
					<div class="note-card">
						<p class="kicker">Fluxo</p>
						<h3>Login primeiro, dashboard depois</h3>
						<p class="soft-copy">Assim que a conexão SSH for validada, a interface troca para o dashboard principal com menu lateral e navegação por telas.</p>
					</div>
					<div class="note-card">
						<p class="kicker">Operação</p>
						<h3>Sudo sem travar</h3>
						<p class="soft-copy">Para esta V1, use root ou configure sudo sem prompt. Comandos interativos, como nano e vim, continuam bloqueados.</p>
					</div>
				</div>
			</section>

			<section class="panel">
				<div>
					<p class="eyebrow">autenticação da VPS</p>
					<h2>Entrar no dashboard</h2>
					<p class="section-copy">Host, porta, usuário e uma credencial válida. Nada é persistido em disco nesta sessão local.</p>
				</div>
				${renderFlash()}
				<form class="stack" data-form="login">
					<div class="field-grid field-grid--compact">
						<label>
							<span>Host</span>
							<input data-scope="login" name="host" type="text" placeholder="203.0.113.10" value="${escapeHtml(state.loginForm.host)}" required />
						</label>
						<label>
							<span>Porta</span>
							<input data-scope="login" name="port" type="number" min="1" max="65535" value="${escapeHtml(state.loginForm.port)}" required />
						</label>
						<label>
							<span>Usuário</span>
							<input data-scope="login" name="username" type="text" value="${escapeHtml(state.loginForm.username)}" required />
						</label>
					</div>

					<div class="tab-row" role="tablist" aria-label="Método de autenticação SSH">
						<button class="tab-button ${usingPassword ? "is-active" : ""}" type="button" data-action="set-auth-method" data-auth-method="password">Senha</button>
						<button class="tab-button ${!usingPassword ? "is-active" : ""}" type="button" data-action="set-auth-method" data-auth-method="privateKey">Chave privada</button>
					</div>

					${
						usingPassword
							? `
								<label>
									<span>Senha</span>
									<input data-scope="login" name="password" type="password" placeholder="Senha do usuário SSH" value="${escapeHtml(state.loginForm.password)}" />
								</label>
							`
							: `
								<label>
									<span>Chave privada</span>
									<textarea data-scope="login" name="privateKey" rows="9" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----">${escapeHtml(state.loginForm.privateKey)}</textarea>
								</label>
								<label>
									<span>Passphrase</span>
									<input data-scope="login" name="passphrase" type="password" placeholder="Opcional" value="${escapeHtml(state.loginForm.passphrase)}" />
								</label>
							`
					}

					<div class="footer-actions">
						<button class="primary-button" type="submit">Conectar e abrir dashboard</button>
					</div>
				</form>
			</section>
		</div>
	`;
}

function renderSidebar() {
	const menuItems = [
		["status", "Status da VPS", "Visão operacional do host remoto"],
		["library", "Biblioteca de add-ons", "Catálogo completo disponível para execução"],
		["installed", "Add-ons instalados", "Detectados na VPS conectada"],
		["logs", "Execuções", "Console e histórico da sessão atual"],
	];

	return `
		<aside class="sidebar">
			<div class="brand-block">
				<div class="brand-mark">VM</div>
				<div class="brand-copy">
					<strong>VPS Manager</strong>
					<span>${escapeHtml(state.session?.username || "guest")}@${escapeHtml(state.session?.host || "localhost")}</span>
				</div>
			</div>

			<div class="session-card">
				<div class="section-head">
					<h3>Sessão</h3>
					<span class="${statusClass()}">${state.session?.busy ? "ocupado" : "online"}</span>
				</div>
				<p class="soft-copy">${state.session?.capabilities?.isRoot || state.session?.capabilities?.canUseSudoWithoutPassword ? "A sessão atual pode executar comandos com sudo sem prompt." : "Comandos com sudo serão bloqueados até usar root ou sudo sem senha."}</p>
			</div>

			<nav class="nav-list">
				${menuItems
					.map(
						([route, title, meta]) => `
							<button class="nav-item ${state.route === route ? "is-active" : ""}" type="button" data-action="navigate" data-route="${route}">
								<span class="nav-label">${escapeHtml(title)}</span>
								<span class="nav-meta">${escapeHtml(meta)}</span>
							</button>
						`,
					)
					.join("")}
			</nav>

			<div class="button-row">
				<button class="ghost-button" type="button" data-action="disconnect">Encerrar sessão</button>
			</div>
		</aside>
	`;
}

function renderDashboardHeader() {
	const meta = getRouteMeta();

	return `
		<header class="dashboard-header">
			<div>
				<p class="eyebrow">dashboard</p>
				<h2>${escapeHtml(meta.title)}</h2>
				<p class="section-copy">${escapeHtml(meta.description)}</p>
			</div>
			<div class="topbar-meta">
				<span class="pill">${escapeHtml(state.session?.username || "-")}@${escapeHtml(state.session?.host || "-")}</span>
				<span class="pill">${escapeHtml(state.session?.capabilities?.distro || "Distribuição não detectada")}</span>
				<span class="pill">Conectado em ${escapeHtml(formatDateTime(state.session?.connectedAt))}</span>
			</div>
		</header>
	`;
}

function renderSessionGrid(snapshot) {
	const capabilityItems = [
		["Host", snapshot.host || "-"],
		["Usuário", snapshot.username || "-"],
		["Porta", snapshot.port || "-"],
		["Autenticação", snapshot.authMethod || "-"],
		["Distribuição", snapshot.capabilities?.distro || "-"],
		["whoami", snapshot.capabilities?.whoami || "-"],
		["Root", snapshot.capabilities?.isRoot ? "sim" : "não"],
		["sudo sem senha", snapshot.capabilities?.canUseSudoWithoutPassword ? "sim" : "não"],
		["Busy", snapshot.busy ? "sim" : "não"],
	];

	return `
		<dl class="session-grid">
			${capabilityItems
				.map(
					([label, value]) => `
						<div class="card">
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

	return `
		<div class="stack">
			<section class="panel">
				<div class="section-head">
					<div>
						<h3>Resumo operacional</h3>
						<p class="section-copy">Última leitura do host remoto. Estes dados são consultados sob demanda e ajudam a validar a saúde básica da VPS.</p>
					</div>
					<div class="button-row">
						<button class="ghost-button" type="button" data-action="refresh-status">Atualizar status</button>
						<button class="ghost-button" type="button" data-action="refresh-installed">Atualizar instalados</button>
					</div>
				</div>
				<div class="status-grid">
					<div class="metric-card">
						<p class="kicker">Hostname</p>
						<div class="metric-value">${escapeHtml(system.hostname || snapshot.host || "-")}</div>
						<p class="soft-copy">Nome principal do host remoto.</p>
					</div>
					<div class="metric-card">
						<p class="kicker">Uptime</p>
						<div class="metric-value">${escapeHtml(system.uptime || "-")}</div>
						<p class="soft-copy">Tempo ligado no momento da última leitura.</p>
					</div>
					<div class="metric-card">
						<p class="kicker">Load avg</p>
						<div class="metric-value">${escapeHtml(system.load || "-")}</div>
						<p class="soft-copy">Três médias de carga coletadas em /proc/loadavg.</p>
					</div>
				</div>
			</section>

			<section class="detail-grid">
				<div class="panel">
					<div class="card-head">
						<h3>Conexão SSH</h3>
						<span class="${statusClass()}">${snapshot.busy ? "ocupado" : "online"}</span>
					</div>
					${renderSessionGrid(snapshot)}
				</div>

				<div class="panel">
					<div class="card-head">
						<h3>Métricas do host</h3>
						<span class="mini-badge">${escapeHtml(formatDateTime(state.statusCheckedAt))}</span>
					</div>
					<div class="metrics-grid">
						<div class="card">
							<p class="kicker">Kernel</p>
							<div class="metric-value">${escapeHtml(system.kernel || "-")}</div>
						</div>
						<div class="card">
							<p class="kicker">Memória</p>
							<div class="metric-value">${escapeHtml(system.memory || "-")}</div>
						</div>
						<div class="card">
							<p class="kicker">Disco raiz</p>
							<div class="metric-value">${escapeHtml(system.disk || "-")}</div>
						</div>
					</div>
					<div class="divider"></div>
					<p class="soft-copy">Se alguma métrica aparecer vazia, atualize o status novamente. O backend faz a consulta por SSH apenas quando necessário para manter a sessão enxuta.</p>
				</div>
			</section>
		</div>
	`;
}

function renderLibraryView() {
	const installedMap = getInstalledMap();

	if (state.addons.length === 0) {
		return `<section class="panel empty-card"><h3>Biblioteca vazia</h3><p class="soft-copy">Nenhum add-on foi encontrado nas pastas addons do pacote ou do diretório atual.</p></section>`;
	}

	return `
		<section class="panel">
			<div class="section-head">
				<div>
					<h3>Catálogo disponível</h3>
					<p class="section-copy">Clique em um add-on para abrir a tela específica e visualizar triggers, parâmetros e ações disponíveis.</p>
				</div>
				<button class="ghost-button" type="button" data-action="refresh-library">Atualizar catálogo</button>
			</div>
			<div class="library-grid">
				${state.addons
					.map((entry) => {
						const installed = installedMap.get(entry.addon.name);
						return `
							<article class="addon-card">
								<div class="addon-card__meta">
									<div>
										<h3>${escapeHtml(entry.addon.name)}</h3>
										<p class="card-copy">${escapeHtml(entry.addon.description)}</p>
									</div>
									<div class="button-row">
										<span class="source-pill">${escapeHtml(entry.sourceType)}</span>
										${installed ? `<span class="pill pill--success">instalado</span>` : `<span class="pill">disponível</span>`}
									</div>
								</div>
								<p class="soft-copy">Versão do manifesto: ${escapeHtml(entry.addon.version)}. Triggers disponíveis: ${entry.addon.triggers.length}.</p>
								<div class="footer-actions">
									<button class="primary-button" type="button" data-action="open-addon" data-addon-name="${escapeHtml(entry.addon.name)}" data-origin="library">Abrir add-on</button>
								</div>
							</article>
						`;
					})
					.join("")}
			</div>
		</section>
	`;
}

function renderInstalledView() {
	if (state.installedAddons.length === 0) {
		return `
			<section class="panel empty-card">
				<h3>Nenhum add-on detectado</h3>
				<p class="soft-copy">A detecção atual usa pacotes Debian/Ubuntu com o mesmo nome do add-on. Atualize a leitura depois de instalar algo novo.</p>
				<div class="footer-actions">
					<button class="ghost-button" type="button" data-action="refresh-installed">Atualizar instalados</button>
				</div>
			</section>
		`;
	}

	return `
		<section class="panel">
			<div class="section-head">
				<div>
					<h3>Add-ons detectados na VPS</h3>
					<p class="section-copy">Última verificação: ${escapeHtml(formatDateTime(state.installedCheckedAt))}. Clique em um item para abrir a tela específica do add-on.</p>
				</div>
				<button class="ghost-button" type="button" data-action="refresh-installed">Atualizar instalados</button>
			</div>
			<div class="library-grid">
				${state.installedAddons
					.map(
						(entry) => `
							<article class="addon-card">
								<div class="addon-card__meta">
									<div>
										<h3>${escapeHtml(entry.addon.name)}</h3>
										<p class="card-copy">${escapeHtml(entry.addon.description)}</p>
									</div>
									<div class="button-row">
										<span class="pill pill--success">instalado</span>
										<span class="source-pill">${escapeHtml(entry.remoteVersion)}</span>
									</div>
								</div>
								<p class="soft-copy">Manifesto ${escapeHtml(entry.addon.version)}. Versão remota detectada: ${escapeHtml(entry.remoteVersion)}.</p>
								<div class="footer-actions">
									<button class="primary-button" type="button" data-action="open-addon" data-addon-name="${escapeHtml(entry.addon.name)}" data-origin="installed">Abrir add-on</button>
								</div>
							</article>
						`,
					)
					.join("")}
			</div>
		</section>
	`;
}

function renderAddonView() {
	const addon = getSelectedAddon();
	const trigger = getSelectedTrigger();
	const installedEntry = addon ? getInstalledMap().get(addon.addon.name) : null;

	if (!addon || !trigger) {
		return `
			<section class="panel empty-card">
				<h3>Add-on não selecionado</h3>
				<p class="soft-copy">Volte para a biblioteca ou para a lista de instalados e escolha um add-on para abrir a tela específica.</p>
				<div class="footer-actions">
					<button class="ghost-button" type="button" data-action="go-back">Voltar</button>
				</div>
			</section>
		`;
	}

	const previewText =
		state.preview && state.preview.addonName === addon.addon.name && state.preview.triggerName === trigger.name
			? state.preview.commands.join("\n")
			: "Use Pré-visualizar para resolver os comandos com os parâmetros atuais.";
	const previewWarnings = state.preview && state.preview.addonName === addon.addon.name && state.preview.triggerName === trigger.name ? state.preview.warnings : [];

	return `
		<div class="stack">
			<section class="panel">
				<div class="section-head">
					<div>
						<p class="eyebrow">detalhe do add-on</p>
						<h3>${escapeHtml(addon.addon.name)}</h3>
						<p class="section-copy">${escapeHtml(addon.addon.description)}</p>
					</div>
					<div class="button-row">
						${installedEntry ? `<span class="pill pill--success">instalado ${escapeHtml(installedEntry.remoteVersion)}</span>` : `<span class="pill">não detectado como instalado</span>`}
						<span class="source-pill">manifesto ${escapeHtml(addon.addon.version)}</span>
						<button class="ghost-button" type="button" data-action="go-back">Voltar</button>
					</div>
				</div>
			</section>

			<section class="detail-grid">
				<div class="panel">
					<div class="card-head">
						<h3>Triggers</h3>
						<span class="mini-badge">${addon.addon.triggers.length} itens</span>
					</div>
					<div class="menu-list">
						${addon.addon.triggers
							.map(
								(item) => `
									<button class="trigger-item ${item.name === trigger.name ? "is-active" : ""}" type="button" data-action="select-trigger" data-trigger-name="${escapeHtml(item.name)}">
										<span class="trigger-title">${escapeHtml(item.name)}</span>
										<span class="trigger-meta">${item.input?.length ? `${item.input.length} campo(s) de entrada` : "sem parâmetros obrigatórios"}</span>
									</button>
								`,
							)
							.join("")}
					</div>
				</div>

				<div class="stack">
					<div class="panel trigger-card">
						<div class="trigger-head">
							<div>
								<h3>${escapeHtml(trigger.name)}</h3>
								<p class="soft-copy">Configure os parâmetros abaixo para pré-visualizar ou executar este trigger.</p>
							</div>
							<span class="mini-badge">${trigger.input?.length || 0} campos</span>
						</div>

						<form class="stack" data-form="trigger">
							${
								trigger.input?.length
									? trigger.input
											.map((input) => {
												const value = state.triggerInputs[input.name] || "";
												const useTextarea = input.placeholder && input.placeholder.includes("\n");
												if (useTextarea) {
													return `
														<label>
															<span>${escapeHtml(input.name)}</span>
															<textarea data-scope="trigger" name="${escapeHtml(input.name)}" rows="9" placeholder="${escapeHtml(input.placeholder || "")}">${escapeHtml(value)}</textarea>
														</label>
													`;
												}

												return `
													<label>
														<span>${escapeHtml(input.name)}</span>
														<input data-scope="trigger" name="${escapeHtml(input.name)}" type="${escapeHtml(input.type || "text")}" placeholder="${escapeHtml(input.placeholder || "")}" value="${escapeHtml(value)}" />
													</label>
												`;
											})
											.join("")
									: `<div class="card"><p class="soft-copy">Este trigger não exige parâmetros. Você pode pré-visualizar ou executar imediatamente.</p></div>`
							}

							<div class="footer-actions">
								<button class="ghost-button" type="button" data-action="preview-trigger">Pré-visualizar</button>
								<button class="primary-button" type="submit">Executar trigger</button>
							</div>
						</form>
					</div>

					<div class="panel">
						<div class="card-head">
							<h3>Comandos resolvidos</h3>
							<span class="mini-badge">preview</span>
						</div>
						<pre class="console">${escapeHtml(previewText)}</pre>
						${previewWarnings.length ? `<div class="flash flash--warning">${escapeHtml(previewWarnings.join(" "))}</div>` : ""}
					</div>

					<div class="panel console-card">
						<div class="card-head">
							<h3>Console recente</h3>
							<div class="button-row">
								<button class="ghost-button" type="button" data-action="navigate" data-route="logs">Abrir tela de execuções</button>
								<button class="ghost-button" type="button" data-action="clear-console">Limpar</button>
							</div>
						</div>
						<pre class="console" data-console-output>${escapeHtml(state.consoleLines.join("\n"))}</pre>
					</div>
				</div>
			</section>
		</div>
	`;
}

function renderLogsView() {
	return `
		<section class="panel">
			<div class="section-head">
				<div>
					<h3>Console da sessão</h3>
					<p class="section-copy">Acompanhe stdout, stderr, início, fim e falhas das execuções enviadas para a VPS remota.</p>
				</div>
				<button class="ghost-button" type="button" data-action="clear-console">Limpar</button>
			</div>
			<pre class="console" data-console-output>${escapeHtml(state.consoleLines.join("\n"))}</pre>
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
		<div class="app-shell">
			${renderSidebar()}
			<section class="dashboard-main">
				${renderDashboardHeader()}
				${renderFlash()}
				${renderCurrentView()}
			</section>
		</div>
	`;
}

function render() {
	if (!isConnected()) {
		state.route = "login";
	}

	normalizeSelections();
	document.title = isConnected() ? `VPS Manager - ${getRouteMeta().title}` : "VPS Manager - Login";
	root.innerHTML = isConnected() ? renderDashboard() : renderLogin();
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
		message: "Sessão SSH conectada. Você já está no dashboard principal.",
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
		message: "Sessão SSH encerrada. Faça login novamente para voltar ao dashboard.",
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
		case "select-trigger":
			state.selectedTriggerName = actionElement.dataset.triggerName || "";
			state.triggerInputs = {};
			state.preview = null;
			render();
			return;
		case "preview-trigger":
			await previewSelectedTrigger();
			return;
		case "clear-console":
			clearConsole();
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
		return;
	}

	if (field.dataset.scope === "trigger") {
		state.triggerInputs[field.name] = field.value;
	}
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
