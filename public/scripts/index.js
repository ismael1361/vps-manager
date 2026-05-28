/* ================================================
   VPS Manager — Entry point (ES module)
   ================================================ */
import { state } from "./state.js";
import { api } from "./api.js";
import { loadAddonsData } from "./data.js";
import { appendTerminalLine } from "./terminal.js";
import { register, navigate } from "./router.js";
import { renderConnectPage } from "./pages/authentication.js";
import { renderDashboardPage } from "./pages/dashboard.js";
import { renderAddonPage } from "./pages/manage_addon.js";
import { renderSettingsPage } from "./pages/settings.js";

// ---- Route registration ----
register("connect",    renderConnectPage);
register("dashboard",  renderDashboardPage);
register("addon",      renderAddonPage);
register("settings",   renderSettingsPage);

// ---- Top-level navigation ----
function renderApp() {
if (!state.session.connected) {
navigate("connect");
} else if (state.selectedAddon) {
navigate("addon", state.selectedAddon, state.selectedView);
} else {
navigate("dashboard");
}
}

// ---- Server-Sent Events ----
var es = null;

function connectSSE() {
if (es) { try { es.close(); } catch (_) {} }
es = new EventSource("/api/stream");

es.addEventListener("session:changed", function (e) {
var ev = JSON.parse(e.data);
var wasConnected = state.session.connected;
state.session = ev.payload;
if (!wasConnected && state.session.connected) {
loadAddonsData().then(function () { navigate("dashboard"); });
} else if (wasConnected && !state.session.connected) {
state.addons = [];
state.installedAddonNames = [];
state.selectedAddon = null;
state.selectedView = null;
navigate("connect");
}
});

es.addEventListener("command:start", function (e) {
var ev = JSON.parse(e.data);
appendTerminalLine({ type: "command", text: "$ " + ev.payload.command, eid: ev.payload.executionId });
});

es.addEventListener("command:stdout", function (e) {
var ev = JSON.parse(e.data);
appendTerminalLine({ type: "stdout", text: ev.payload.chunk, eid: ev.payload.executionId });
});

es.addEventListener("command:stderr", function (e) {
var ev = JSON.parse(e.data);
appendTerminalLine({ type: "stderr", text: ev.payload.chunk, eid: ev.payload.executionId });
});

es.addEventListener("execution:complete", function (e) {
var ev = JSON.parse(e.data);
appendTerminalLine({ type: "success", text: "? " + ev.payload.triggerName + " completed", eid: ev.payload.executionId });
if (state.session.connected) {
api.getInstalledAddons()
.then(function (list) {
state.installedAddonNames = list.map(function (a) { return a.addon.name; });
})
.catch(function () {});
}
});

es.addEventListener("execution:error", function (e) {
var ev = JSON.parse(e.data);
appendTerminalLine({ type: "error", text: "? " + ev.payload.message, eid: ev.payload.executionId });
});

es.onerror = function () {};
}

// ---- Init ----
api.getSession()
.then(function (snapshot) { state.session = snapshot; })
.catch(function () { state.session = { connected: false, busy: false }; })
.then(function () { if (state.session.connected) return loadAddonsData(); })
.then(function () { connectSSE(); renderApp(); });
