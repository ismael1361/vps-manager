/* ================================================
   VPS Manager — Global application state
   React Context + useReducer (sem JSX)
   ================================================ */
import React, { createContext, useContext, useReducer } from "https://esm.sh/react@18";

export var initialState = {
	session: { connected: false, busy: false },
	addons: [],
	installedAddonNames: [],
	installedAddons: [],
	/** Record<addonId, AddonConfigEntry> — populated from vps-manager-addons.cfg */
	addonConfigs: {},
	selectedAddon: null,
	selectedView: null,
	terminal: [],
	terminalVisible: false,
	sidebarOpen: false,
	vpsStatus: null,
	page: "connect",
};

export function reducer(state, action) {
	switch (action.type) {
		case "SET_SESSION":
			return Object.assign({}, state, { session: action.payload });
		case "SET_ADDONS":
			return Object.assign({}, state, { addons: action.payload });
		case "SET_INSTALLED":
			return Object.assign({}, state, { installedAddonNames: action.payload });
		case "SET_INSTALLED_ADDONS":
			return Object.assign({}, state, { installedAddons: action.payload });
		case "SET_VPS_STATUS":
			return Object.assign({}, state, { vpsStatus: action.payload });
		case "SET_TERMINAL_VISIBLE":
			return Object.assign({}, state, { terminalVisible: action.payload });
		case "TOGGLE_TERMINAL":
			return Object.assign({}, state, { terminalVisible: !state.terminalVisible });
		case "SET_SIDEBAR_OPEN":
			return Object.assign({}, state, { sidebarOpen: action.payload });
		case "APPEND_TERMINAL": {
			var line = Object.assign({}, action.payload, { id: Date.now() + Math.random() });
			var terminal = state.terminal.concat([line]);
			if (terminal.length > 600) terminal = terminal.slice(-600);
			return Object.assign({}, state, { terminal: terminal });
		}
		case "CLEAR_TERMINAL":
			return Object.assign({}, state, { terminal: [] });
		case "NAVIGATE":
			return Object.assign({}, state, {
				page: action.payload.page,
				selectedAddon: "addon" in action.payload ? action.payload.addon : state.selectedAddon,
				selectedView: "view" in action.payload ? action.payload.view : state.selectedView,
				terminal: [],
			});
		case "SELECT_VIEW":
			return Object.assign({}, state, { selectedView: action.payload, terminal: [] });
		// ---- Addon config actions ----
		case "SET_ADDON_CONFIGS": {
			// payload: the full AddonConfigFile.addons object
			return Object.assign({}, state, { addonConfigs: action.payload || {} });
		}
		case "PATCH_ADDON_CONFIG": {
			// payload: { id: string, entry: AddonConfigEntry | null }
			var id = action.payload.id;
			var entry = action.payload.entry;
			var configs = Object.assign({}, state.addonConfigs);
			if (entry === null) {
				delete configs[id];
			} else {
				configs[id] = entry;
			}
			return Object.assign({}, state, { addonConfigs: configs });
		}
		default:
			return state;
	}
}

export var AppContext = createContext(null);

export function AppProvider(props) {
	var pair = useReducer(reducer, initialState);
	var state = pair[0];
	var dispatch = pair[1];
	return React.createElement(AppContext.Provider, { value: { state: state, dispatch: dispatch } }, props.children);
}

export function useAppState() {
	return useContext(AppContext);
}

export function isInstalled(installedAddonNames, addonName) {
	return installedAddonNames.indexOf(addonName) !== -1;
}
