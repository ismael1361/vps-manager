/* ================================================
   VPS Manager — Pure utility functions
   ================================================ */
export function escHtml(str) {
	return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Returns a stable, URL-safe ID for an addon entry (matching server getAddonId). */
export function getAddonId(entry) {
	var addon = entry && entry.addon ? entry.addon : entry;
	if (!addon) return "";
	if (addon.short_name) return addon.short_name;
	return addon.name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Returns the config state for an addon ("installed", "pending", "error", "uninstalled", or null). */
export function getAddonState(addonConfigs, addonId) {
	var entry = addonConfigs && addonConfigs[addonId];
	return entry ? entry.state : null;
}

/** Returns the full config entry or null. */
export function getAddonConfigEntry(addonConfigs, addonId) {
	return (addonConfigs && addonConfigs[addonId]) || null;
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

// ---- localStorage helpers (never stores passwords or private keys) ----
var STORAGE_KEY = "vpsm_recent_connections";
var LEGACY_STORAGE_KEY = "vpsm_last_conn";
var MAX_RECENT_CONNECTIONS = 6;

function normalizeStoredConnection(data) {
	if (!data || typeof data !== "object") {
		return null;
	}

	var host = typeof data.host === "string" ? data.host.trim() : "";
	var username = typeof data.username === "string" ? data.username.trim() : "";
	var port = parseInt(data.port, 10);

	if (!host) {
		return null;
	}

	if (!username) {
		username = "root";
	}

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		port = 22;
	}

	return {
		host: host,
		port: port,
		username: username,
	};
}

function dedupeRecentConnections(connections) {
	var unique = [];
	var seen = Object.create(null);

	for (var i = 0; i < connections.length; i += 1) {
		var connection = normalizeStoredConnection(connections[i]);
		if (!connection) {
			continue;
		}

		var key = connection.username.toLowerCase() + "@" + connection.host.toLowerCase() + ":" + connection.port;
		if (seen[key]) {
			continue;
		}

		seen[key] = true;
		unique.push(connection);

		if (unique.length >= MAX_RECENT_CONNECTIONS) {
			break;
		}
	}

	return unique;
}

function parseStoredConnections(raw) {
	var parsed = JSON.parse(raw);
	if (Array.isArray(parsed)) {
		return dedupeRecentConnections(parsed);
	}

	var connection = normalizeStoredConnection(parsed);
	return connection ? [connection] : [];
}

export function loadRecentConnections() {
	try {
		var raw = localStorage.getItem(STORAGE_KEY);
		var legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
		var connections = raw ? parseStoredConnections(raw) : [];

		if (!connections.length && legacyRaw) {
			connections = parseStoredConnections(legacyRaw);
		}

		if (legacyRaw) {
			localStorage.removeItem(LEGACY_STORAGE_KEY);
		}

		if (connections.length) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
		} else if (raw || legacyRaw) {
			localStorage.removeItem(STORAGE_KEY);
		}

		return connections;
	} catch (_) {
		return [];
	}
}

export function saveRecentConnection(data) {
	try {
		var connection = normalizeStoredConnection(data);
		if (!connection) {
			return loadRecentConnections();
		}

		var current = loadRecentConnections();
		var next = dedupeRecentConnections([connection].concat(current));
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		return next;
	} catch (_) {
		return [];
	}
}

export function removeRecentConnection(data) {
	try {
		var connection = normalizeStoredConnection(data);
		if (!connection) {
			return loadRecentConnections();
		}

		var current = loadRecentConnections();
		var next = current.filter(function (entry) {
			return entry.host.toLowerCase() !== connection.host.toLowerCase() || entry.port !== connection.port || entry.username.toLowerCase() !== connection.username.toLowerCase();
		});

		if (next.length) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} else {
			localStorage.removeItem(STORAGE_KEY);
		}

		return next;
	} catch (_) {
		return [];
	}
}

export function saveLastConnection(data) {
	return saveRecentConnection(data);
}

export function loadLastConnection() {
	var connections = loadRecentConnections();
	return connections[0] || null;
}
