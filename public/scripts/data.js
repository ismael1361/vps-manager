/* ================================================
   VPS Manager — Remote data fetching / state hydration
   Adaptado para React (recebe dispatch como parâmetro)
   ================================================ */
import { api } from "./api.js";

export function loadAddonsData(session, dispatch) {
	return api
		.getAddons()
		.then(function (list) {
			dispatch({ type: "SET_ADDONS", payload: list });
			// Hydrate addonConfigs from the configEntry embedded in the addon list response
			var configs = {};
			list.forEach(function (entry) {
				var id = entry.id || (entry.addon && entry.addon.short_name) || "";
				if (id && entry.configEntry) {
					configs[id] = entry.configEntry;
				}
			});
			dispatch({ type: "SET_ADDON_CONFIGS", payload: configs });
		})
		.catch(function () {})
		.then(function () {
			// Also refresh configs from the dedicated endpoint (handles addons removed from disk but still in config)
			return api
				.getAllAddonConfigs()
				.then(function (configFile) {
					dispatch({ type: "SET_ADDON_CONFIGS", payload: configFile.addons || {} });
				})
				.catch(function () {});
		})
		.then(function () {
			if (!session || !session.connected) return;
			return api
				.getInstalledAddons()
				.then(function (list) {
					dispatch({
						type: "SET_INSTALLED",
						payload: list.map(function (a) {
							return a.addon.name;
						}),
					});
				})
				.catch(function () {
					dispatch({ type: "SET_INSTALLED", payload: [] });
				});
		});
}
