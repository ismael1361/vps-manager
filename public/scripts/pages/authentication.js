/* ================================================
   VPS Manager — Connect / Authentication page
   ================================================ */
import { state } from "../state.js";
import { api } from "../api.js";
import { escHtml, saveLastConnection, loadLastConnection } from "../utils.js";
import { buildTopbar, buildTip } from "../components.js";
import { loadAddonsData } from "../data.js";
import { navigate } from "../router.js";

export function renderConnectPage() {
	var last = loadLastConnection();
	var app = document.getElementById("app");
	app.className = "bg-background text-on-background min-h-screen flex flex-col";

	var lastBadge = last
		? '<div class="flex items-center gap-xs px-sm py-xs bg-surface-container-highest border border-outline-variant rounded text-on-surface-variant font-code-block text-code-block">' +
			'<span class="material-symbols-outlined" style="font-size:14px">history</span>' +
			'Last: <span class="text-on-surface">' +
			escHtml(last.username) +
			"@" +
			escHtml(last.host) +
			":" +
			escHtml(String(last.port)) +
			"</span>" +
			"</div>"
		: "";

	app.innerHTML =
		buildTopbar(false) +
		'<main class="flex-1 flex items-center justify-center p-margin-desktop">' +
		'<div class="flex gap-xl w-full" style="max-width:960px">' +
		// Left: branding + tips
		'<div class="flex-1 hidden md:flex flex-col justify-center pr-xl">' +
		'<div class="flex items-center gap-sm mb-lg">' +
		'<div class="w-10 h-10 rounded bg-primary flex items-center justify-center text-on-primary">' +
		'<span class="material-symbols-outlined">terminal</span>' +
		"</div>" +
		'<h1 class="font-display-sm text-display-sm text-on-surface">VPS Manager</h1>' +
		"</div>" +
		'<p class="font-body-lg text-body-lg text-on-surface-variant mb-xl">Manage your server infrastructure with add-ons and an integrated terminal.</p>' +
		'<ul class="flex flex-col gap-md">' +
		buildTip("extension", "Add-on ecosystem", "Install and manage nginx, Docker, MySQL and many other services via XML-driven add-ons.") +
		buildTip("terminal", "Integrated terminal", "Every command execution is streamed in real time to the built-in terminal panel.") +
		buildTip("lock", "Secure connection", "Connects over SSH using password or private key — credentials are never stored locally.") +
		"</ul></div>" +
		// Right: form card
		'<div class="w-full md:w-96 shrink-0">' +
		'<div class="bg-surface-container-low border border-outline-variant rounded-2xl p-xl flex flex-col gap-md">' +
		'<div class="justify-between items-center mb-xs">' +
		'<h2 class="font-headline-sm text-headline-sm text-on-surface">SSH Connection</h2>' +
		lastBadge +
		"</div>" +
		'<form id="connect-form" class="flex flex-col gap-md">' +
		// Host + Port
		'<div class="flex gap-sm">' +
		'<div class="flex-1">' +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Host</label>' +
		'<input id="inp-host" type="text" placeholder="192.168.1.1" autocomplete="off" value="' +
		(last ? escHtml(last.host) : "") +
		'" class="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary" />' +
		"</div>" +
		'<div style="width:90px">' +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Port</label>' +
		'<input id="inp-port" type="number" min="1" max="65535" value="' +
		(last ? escHtml(String(last.port)) : "22") +
		'" class="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary" />' +
		"</div></div>" +
		// Username
		"<div>" +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Username</label>' +
		'<input id="inp-user" type="text" autocomplete="off" value="' +
		(last ? escHtml(last.username) : "root") +
		'" class="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary" />' +
		"</div>" +
		// Auth method toggle
		"<div>" +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Auth Method</label>' +
		'<div class="flex gap-xs">' +
		'<button type="button" id="auth-password-btn" class="flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors auth-method-btn" data-method="password">Password</button>' +
		'<button type="button" id="auth-key-btn"      class="flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors auth-method-btn" data-method="sshkey">SSH Key</button>' +
		"</div></div>" +
		// Password section
		'<div id="auth-password-section">' +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Password</label>' +
		'<div class="relative">' +
		'<input id="inp-password" type="password" autocomplete="current-password" class="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full pr-10 outline-none focus:border-primary" />' +
		'<button type="button" id="toggle-password" class="absolute right-xs top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors">' +
		'<span class="material-symbols-outlined" id="toggle-password-icon">visibility</span>' +
		"</button></div></div>" +
		// SSH key section
		'<div id="auth-key-section" class="hidden flex flex-col gap-sm">' +
		'<label class="font-label-caps text-label-caps text-on-surface-variant block mb-xs">Private Key</label>' +
		'<textarea id="inp-private-key" rows="5" placeholder="-----BEGIN RSA PRIVATE KEY-----" class="bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary resize-none"></textarea>' +
		'<input type="file" id="key-file-input" accept=".pem,.key,.pub,*" class="hidden" />' +
		'<button type="button" id="load-key-file" class="flex items-center gap-xs text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps transition-colors">' +
		'<span class="material-symbols-outlined" style="font-size:16px">upload_file</span>Load from file' +
		"</button></div>" +
		// Submit
		'<div id="connect-error" class="hidden font-code-block text-code-block text-error bg-error-container rounded-lg px-sm py-xs"></div>' +
		'<button type="submit" id="connect-btn" class="w-full py-sm bg-primary text-on-primary rounded-lg font-label-caps text-label-caps hover:bg-primary-fixed transition-colors flex items-center justify-center gap-xs">' +
		'<span class="material-symbols-outlined" style="font-size:18px">link</span>Connect' +
		"</button>" +
		"</form></div></div></div></main>";

	bindConnectEvents(last);
}

// ---- Private helpers ----

function bindConnectEvents(last) {
	var authMethod = (last && last.authMethod) || "password";
	toggleAuthMethod(authMethod);

	// Restore SSH key from last session
	if (last && last.privateKey && authMethod === "sshkey") {
		var pkEl = document.getElementById("inp-private-key");
		if (pkEl) pkEl.value = last.privateKey;
	}

	// Auth method buttons
	document.querySelectorAll(".auth-method-btn").forEach(function (btn) {
		btn.addEventListener("click", function () {
			toggleAuthMethod(btn.dataset.method);
		});
	});

	// Toggle password visibility
	var togglePwdBtn = document.getElementById("toggle-password");
	if (togglePwdBtn) {
		togglePwdBtn.addEventListener("click", function () {
			var inp = document.getElementById("inp-password");
			var icon = document.getElementById("toggle-password-icon");
			if (!inp) return;
			var isText = inp.type === "text";
			inp.type = isText ? "password" : "text";
			if (icon) icon.textContent = isText ? "visibility" : "visibility_off";
		});
	}

	// Load private key from file
	var loadKeyBtn = document.getElementById("load-key-file");
	var keyFileInput = document.getElementById("key-file-input");
	if (loadKeyBtn && keyFileInput) {
		loadKeyBtn.addEventListener("click", function () {
			keyFileInput.click();
		});
		keyFileInput.addEventListener("change", function () {
			var file = keyFileInput.files && keyFileInput.files[0];
			if (!file) return;
			var reader = new FileReader();
			reader.onload = function (e) {
				var pkEl = document.getElementById("inp-private-key");
				if (pkEl) pkEl.value = e.target.result;
			};
			reader.readAsText(file);
		});
	}

	// Form submit
	var form = document.getElementById("connect-form");
	if (form) {
		form.addEventListener("submit", function (e) {
			handleConnect(e, authMethod);
		});
		// Keep authMethod reference up to date when user clicks buttons
		document.querySelectorAll(".auth-method-btn").forEach(function (btn) {
			btn.addEventListener("click", function () {
				authMethod = btn.dataset.method;
			});
		});
	}
}

function toggleAuthMethod(method) {
	var pwdSection = document.getElementById("auth-password-section");
	var keySection = document.getElementById("auth-key-section");
	var pwdBtn = document.getElementById("auth-password-btn");
	var keyBtn = document.getElementById("auth-key-btn");
	if (!pwdSection || !keySection) return;

	var active = "bg-primary-container text-on-primary-container border-primary";
	var inactive = "bg-surface-container text-on-surface-variant border-outline-variant";

	if (method === "password") {
		pwdSection.classList.remove("hidden");
		keySection.classList.add("hidden");
		if (pwdBtn) {
			pwdBtn.className = pwdBtn.className.replace(/auth-method-btn\s*/, "");
			pwdBtn.className += " auth-method-btn flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors " + active;
		}
		if (keyBtn) {
			keyBtn.className = keyBtn.className.replace(/auth-method-btn\s*/, "");
			keyBtn.className += " auth-method-btn flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors " + inactive;
		}
	} else {
		pwdSection.classList.add("hidden");
		keySection.classList.remove("hidden");
		if (pwdBtn) {
			pwdBtn.className = pwdBtn.className.replace(/auth-method-btn\s*/, "");
			pwdBtn.className += " auth-method-btn flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors " + inactive;
		}
		if (keyBtn) {
			keyBtn.className = keyBtn.className.replace(/auth-method-btn\s*/, "");
			keyBtn.className += " auth-method-btn flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors " + active;
		}
	}
}

function handleConnect(e, authMethod) {
	e.preventDefault();

	var hostEl = document.getElementById("inp-host");
	var portEl = document.getElementById("inp-port");
	var userEl = document.getElementById("inp-user");
	var pwdEl = document.getElementById("inp-password");
	var pkEl = document.getElementById("inp-private-key");
	var errEl = document.getElementById("connect-error");
	var btn = document.getElementById("connect-btn");

	if (!hostEl || !portEl || !userEl) return;

	var host = hostEl.value.trim();
	var port = parseInt(portEl.value, 10) || 22;
	var username = userEl.value.trim();
	var password = pwdEl ? pwdEl.value : "";
	var privateKey = pkEl ? pkEl.value.trim() : "";

	if (errEl) errEl.classList.add("hidden");

	if (!host || !username) {
		if (errEl) {
			errEl.textContent = "Host and username are required.";
			errEl.classList.remove("hidden");
		}
		return;
	}

	var payload = { host: host, port: port, username: username, authMethod: authMethod };
	if (authMethod === "password") payload.password = password;
	else payload.privateKey = privateKey;

	if (btn) {
		btn.disabled = true;
		btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:18px">sync</span>Connecting…';
	}

	api.connect(payload)
		.then(function (snapshot) {
			saveLastConnection({
				host: host,
				port: port,
				username: username,
				authMethod: authMethod,
				privateKey: privateKey,
			});
			state.session = snapshot;
			return loadAddonsData();
		})
		.then(function () {
			navigate("dashboard");
		})
		.catch(function (err) {
			if (errEl) {
				errEl.textContent = err.message;
				errEl.classList.remove("hidden");
			}
			if (btn) {
				btn.disabled = false;
				btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">link</span>Connect';
			}
		});
}
