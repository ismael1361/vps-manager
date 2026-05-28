/* ================================================
   VPS Manager — Remote data fetching / state hydration
   ================================================ */
import { state } from "./state.js";
import { api } from "./api.js";

export function loadAddonsData() {
	return api
		.getAddons()
		.then(function (list) { state.addons = list; })
		.catch(function () {})
		.then(function () {
			if (!state.session.connected) return;
			return api
				.getInstalledAddons()
				.then(function (list) {
					state.installedAddonNames = list.map(function (a) { return a.addon.name; });
				})
				.catch(function () { state.installedAddonNames = []; });
		});
}
