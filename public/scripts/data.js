/* ================================================
   VPS Manager — Remote data fetching / state hydration
   Adaptado para React (recebe dispatch como parâmetro)
   ================================================ */
import { api } from "./api.js";

function applyInstalledAddons(list, dispatch) {
	dispatch({
		type: "SET_INSTALLED",
		payload: list.map(function (entry) {
			return entry.addon.name;
		}),
	});
	dispatch({ type: "SET_INSTALLED_ADDONS", payload: list });
	return list;
}

export function refreshInstalledAddons(dispatch) {
	return api
		.getInstalledAddons()
		.then(function (list) {
			return applyInstalledAddons(list, dispatch);
		})
		.catch(function () {
			dispatch({ type: "SET_INSTALLED", payload: [] });
			dispatch({ type: "SET_INSTALLED_ADDONS", payload: [] });
			return [];
		});
}

export function refreshVpsStatus(dispatch) {
	return api
		.getVpsStatus()
		.then(function (status) {
			dispatch({ type: "SET_VPS_STATUS", payload: status });
			return status;
		})
		.catch(function () {
			dispatch({ type: "SET_VPS_STATUS", payload: null });
			return null;
		});
}

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
		.catch(function () {
			dispatch({ type: "SET_ADDONS", payload: [] });
			dispatch({ type: "SET_ADDON_CONFIGS", payload: {} });
		})
		.then(function () {
			// Also refresh configs from the dedicated endpoint (handles addons removed from disk but still in config)
			return api
				.getAllAddonConfigs()
				.then(function (configFile) {
					dispatch({ type: "SET_ADDON_CONFIGS", payload: configFile.addons || {} });
				})
				.catch(function () {
					dispatch({ type: "SET_ADDON_CONFIGS", payload: {} });
				});
		})
		.then(function () {
			if (!session || !session.connected) {
				dispatch({ type: "SET_INSTALLED", payload: [] });
				dispatch({ type: "SET_INSTALLED_ADDONS", payload: [] });
				dispatch({ type: "SET_VPS_STATUS", payload: null });
				return;
			}

			return refreshVpsStatus(dispatch).then(function () {
				return refreshInstalledAddons(dispatch);
			});
		});
}
