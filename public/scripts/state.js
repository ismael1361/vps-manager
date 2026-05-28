/* ================================================
   VPS Manager — Shared application state
   ================================================ */
export var state = {
	session: { connected: false, busy: false },
	addons: [],
	installedAddonNames: [],
	selectedAddon: null,
	selectedView: null,
	terminal: [],
	terminalVisible: false,
	sidebarOpen: false,
	vpsStatus: null,
};

export function isInstalled(addonName) {
	return state.installedAddonNames.indexOf(addonName) !== -1;
}
