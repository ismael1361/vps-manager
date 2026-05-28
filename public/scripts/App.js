/* ================================================
   VPS Manager — Componente raiz da aplicação
   Gerencia SSE e roteamento por estado (sem JSX)
   ================================================ */
import React, { useEffect, useRef } from "https://esm.sh/react@18";
import { useAppState } from "./store.js";
import { api } from "./api.js";
import { loadAddonsData } from "./data.js";
import { ConnectPage } from "./pages/ConnectPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { AddonPage } from "./pages/AddonPage.js";
import { SettingsPage } from "./pages/SettingsPage.js";

export function App() {
	var ctx = useAppState();
	var state = ctx.state;
	var dispatch = ctx.dispatch;

	// Ref para manter o estado de conexão atualizado dentro dos handlers SSE
	var connectedRef = useRef(false);
	var esRef = useRef(null);

	function connectSSE() {
		if (esRef.current) {
			try {
				esRef.current.close();
			} catch (_) {}
		}
		var es = new EventSource("/api/stream");
		esRef.current = es;

		// O servidor reenvia o backlog de eventos para novos clientes SSE antes de
		// emitir "stream:ready". Eventos recebidos antes de "stream:ready" são replays
		// stale e devem ser ignorados para evitar navegação incorreta.
		var sseReady = false;

		es.addEventListener("stream:ready", function () {
			sseReady = true;
		});

		es.addEventListener("session:changed", function (e) {
			if (!sseReady) return;
			var ev = JSON.parse(e.data);
			var payload = ev.payload;
			var wasConnected = connectedRef.current;
			connectedRef.current = !!payload.connected;
			dispatch({ type: "SET_SESSION", payload: payload });
			if (!wasConnected && payload.connected) {
				loadAddonsData(payload, dispatch).then(function () {
					dispatch({ type: "NAVIGATE", payload: { page: "dashboard" } });
				});
			} else if (wasConnected && !payload.connected) {
				dispatch({ type: "SET_ADDONS", payload: [] });
				dispatch({ type: "SET_INSTALLED", payload: [] });
				dispatch({ type: "NAVIGATE", payload: { page: "connect", addon: null, view: null } });
			}
		});

		es.addEventListener("command:start", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "APPEND_TERMINAL", payload: { type: "command", text: "$ " + ev.payload.command, eid: ev.payload.executionId } });
		});

		es.addEventListener("command:stdout", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "APPEND_TERMINAL", payload: { type: "stdout", text: ev.payload.chunk, eid: ev.payload.executionId } });
		});

		es.addEventListener("command:stderr", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "APPEND_TERMINAL", payload: { type: "stderr", text: ev.payload.chunk, eid: ev.payload.executionId } });
		});

		es.addEventListener("execution:complete", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "APPEND_TERMINAL", payload: { type: "success", text: "✓ " + ev.payload.triggerName + " completed", eid: ev.payload.executionId } });
			api.getInstalledAddons()
				.then(function (list) {
					dispatch({
						type: "SET_INSTALLED",
						payload: list.map(function (a) {
							return a.addon.name;
						}),
					});
				})
				.catch(function () {});
		});

		es.addEventListener("execution:error", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "APPEND_TERMINAL", payload: { type: "error", text: "✗ " + ev.payload.message, eid: ev.payload.executionId } });
		});

		es.addEventListener("addon:config", function (e) {
			var ev = JSON.parse(e.data);
			dispatch({ type: "PATCH_ADDON_CONFIG", payload: { id: ev.payload.addonId, entry: ev.payload.entry } });
		});

		es.onerror = function () {};
	}

	useEffect(function () {
		api.getSession()
			.then(function (snapshot) {
				connectedRef.current = !!snapshot.connected;
				dispatch({ type: "SET_SESSION", payload: snapshot });
				return snapshot;
			})
			.catch(function () {
				var fallback = { connected: false, busy: false };
				connectedRef.current = false;
				dispatch({ type: "SET_SESSION", payload: fallback });
				return fallback;
			})
			.then(function (session) {
				if (session.connected) {
					return loadAddonsData(session, dispatch).then(function () {
						dispatch({ type: "NAVIGATE", payload: { page: "dashboard" } });
					});
				} else {
					dispatch({ type: "NAVIGATE", payload: { page: "connect" } });
				}
			})
			.then(function () {
				connectSSE();
			});

		return function () {
			if (esRef.current) {
				try {
					esRef.current.close();
				} catch (_) {}
			}
		};
	}, []);

	var page = state.page;
	if (page === "connect") return React.createElement(ConnectPage);
	if (page === "dashboard") return React.createElement(DashboardPage);
	if (page === "addon") return React.createElement(AddonPage);
	if (page === "settings") return React.createElement(SettingsPage);
	return React.createElement(ConnectPage);
}
