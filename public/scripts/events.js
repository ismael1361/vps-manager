/* ================================================
   VPS Manager — Shared DOM event bindings
   ================================================ */
import { state } from "./state.js";
import { api } from "./api.js";
import { appendTerminalLine } from "./terminal.js";
import { cleanupCurrentView } from "./addon-runner.js";
import { navigate } from "./router.js";

export function bindSharedEvents() {
	// Nav links
	document.querySelectorAll("[data-nav]").forEach(function (el) {
		el.addEventListener("click", function (e) {
			e.preventDefault();
			var nav = el.dataset.nav;
			if (nav === "dashboard" || nav === "addons") {
				cleanupCurrentView();
				state.selectedAddon = null;
				state.selectedView = null;
				navigate("dashboard");
			} else if (nav === "settings") {
				navigate("settings");
			}
		});
	});

	// Open addon manager
	document.querySelectorAll('[data-action="open-addon"]').forEach(function (btn) {
		btn.addEventListener("click", function () {
			state.selectedAddon = btn.dataset.addon;
			state.selectedView = null;
			navigate("addon", state.selectedAddon, null);
		});
	});

	// Install addon (navigates to addon page then triggers install)
	document.querySelectorAll('[data-action="install-addon"]').forEach(function (btn) {
		btn.addEventListener("click", function () {
			var addonName = btn.dataset.addon;
			state.selectedAddon = addonName;
			state.selectedView = null;
			state.terminal = [];
			navigate("addon", addonName, null);
			api.runTrigger(addonName, "install", {}).catch(function (err) {
				appendTerminalLine({ type: "error", text: "Install failed: " + err.message });
			});
		});
	});

	// Disconnect
	var discBtn = document.querySelector('[data-action="disconnect"]');
	if (discBtn) {
		discBtn.addEventListener("click", function (e) {
			e.preventDefault();
			cleanupCurrentView();
			api.disconnect()
				.then(function () {
					state.session = { connected: false, busy: false };
					state.addons = [];
					state.installedAddonNames = [];
					state.selectedAddon = null;
					state.selectedView = null;
					state.vpsStatus = null;
					navigate("connect");
				})
				.catch(function (err) {
					console.error("Disconnect error:", err);
				});
		});
	}

	// Refresh VPS status
	var refreshBtn = document.querySelector('[data-action="refresh-status"]');
	if (refreshBtn) {
		refreshBtn.addEventListener("click", function () {
			api.getVpsStatus()
				.then(function (s) {
					state.vpsStatus = s;
				})
				.catch(function () {});
		});
	}

	// Mobile sidebar toggle
	var toggleSidebarBtn = document.querySelector('[data-action="toggle-sidebar"]');
	if (toggleSidebarBtn) {
		toggleSidebarBtn.addEventListener("click", function () {
			var sidebar = document.getElementById("sidebar");
			if (sidebar) sidebar.classList.toggle("open");
		});
	}
}
