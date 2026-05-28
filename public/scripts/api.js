/* ================================================
   VPS Manager — API client
   ================================================ */
export var api = {
	request: function (method, path, body) {
		var opts = { method: method, headers: { "Content-Type": "application/json" } };
		if (body !== undefined) opts.body = JSON.stringify(body);
		return fetch(path, opts).then(function (res) {
			return res.json().then(function (data) {
				if (!res.ok) throw new Error(data.message || "HTTP " + res.status);
				return data;
			});
		});
	},
	get: function (path) {
		return api.request("GET", path);
	},
	post: function (path, body) {
		return api.request("POST", path, body);
	},
	getSession: function () {
		return api.get("/api/session");
	},
	connect: function (data) {
		return api.post("/api/session/connect", data);
	},
	disconnect: function () {
		return api.post("/api/session/disconnect");
	},
	getAddons: function () {
		return api.get("/api/addons");
	},
	getInstalledAddons: function () {
		return api.get("/api/addons/installed");
	},
	getVpsStatus: function () {
		return api.get("/api/vps/status");
	},
	executeTrigger: function (addonName, triggerName, inputs) {
		return api.post("/api/triggers/execute", { addonName: addonName, triggerName: triggerName, inputs: inputs || {} });
	},
	runTrigger: function (addonName, triggerName, inputs) {
		return api.post("/api/triggers/run", { addonName: addonName, triggerName: triggerName, inputs: inputs || {} });
	},
	// ---- Addon config (vps-manager-addons.cfg) ----
	getAllAddonConfigs: function () {
		return api.get("/api/addons/config");
	},
	getAddonConfig: function (addonId) {
		return api.get("/api/addons/" + encodeURIComponent(addonId) + "/config");
	},
	/**
	 * Partial-update an addon's config entry.
	 * Accepted fields: state, scope (merged), error, metadata (full upsert when present).
	 */
	patchAddonConfig: function (addonId, patch) {
		return api.request("PATCH", "/api/addons/" + encodeURIComponent(addonId) + "/config", patch);
	},
	removeAddonConfig: function (addonId) {
		return api.request("DELETE", "/api/addons/" + encodeURIComponent(addonId) + "/config");
	},
};
