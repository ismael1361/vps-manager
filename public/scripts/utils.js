/* ================================================
   VPS Manager — Pure utility functions
   ================================================ */
export function escHtml(str) {
	return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export var ADDON_ICONS = {
	nginx: { icon: "dns", color: "text-primary" },
	apache: { icon: "web", color: "text-primary" },
	docker: { icon: "view_in_ar", color: "text-secondary" },
	mysql: { icon: "database", color: "text-tertiary" },
	mariadb: { icon: "database", color: "text-tertiary" },
	redis: { icon: "memory", color: "text-error" },
	nodejs: { icon: "javascript", color: "text-primary" },
	node: { icon: "javascript", color: "text-primary" },
	postgres: { icon: "database", color: "text-secondary" },
	ufw: { icon: "security", color: "text-tertiary" },
	certbot: { icon: "lock", color: "text-primary" },
	git: { icon: "source", color: "text-secondary" },
	php: { icon: "code", color: "text-secondary" },
	pm2: { icon: "play_circle", color: "text-primary" },
};

export function getAddonIcon(name) {
	var key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
	var keys = Object.keys(ADDON_ICONS);
	for (var i = 0; i < keys.length; i++) {
		if (key.indexOf(keys[i]) !== -1) return ADDON_ICONS[keys[i]];
	}
	return { icon: "extension", color: "text-on-surface-variant" };
}

// ---- localStorage helpers (never stores passwords) ----
var STORAGE_KEY = "vpsm_last_conn";

export function saveLastConnection(data) {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				host: data.host || "",
				port: data.port || 22,
				username: data.username || "",
				authMethod: data.authMethod || "password",
				privateKey: data.privateKey || "",
			}),
		);
	} catch (_) {}
}

export function loadLastConnection() {
	try {
		var raw = localStorage.getItem(STORAGE_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch (_) {
		return null;
	}
}
