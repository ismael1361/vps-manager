/* ================================================
   VPS Manager — Página de Autenticação (sem JSX)
   ================================================ */
import React, { useState } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { api } from "../api.js";
import { saveRecentConnection, loadRecentConnections, removeRecentConnection } from "../utils.js";
import { loadAddonsData } from "../data.js";
import { Topbar } from "../components/Topbar.js";

function Tip(props) {
	return React.createElement(
		"li",
		{ className: "flex gap-sm items-start" },
		React.createElement("span", { className: "material-symbols-outlined text-outline-variant mt-xs shrink-0", style: { fontSize: "18px" } }, props.icon),
		React.createElement(
			"div",
			null,
			React.createElement("h3", { className: "font-body-md text-body-md font-semibold text-on-surface" }, props.title),
			React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant mt-xs leading-relaxed" }, props.body),
		),
	);
}

function createDraftConnection() {
	return {
		host: "",
		port: 22,
		username: "root",
	};
}

function normalizePort(value) {
	var port = parseInt(value, 10);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		return 22;
	}

	return port;
}

function normalizeUsername(value) {
	if (typeof value !== "string") {
		return "root";
	}

	var username = value.trim();
	return username || "root";
}

function getConnectionKey(connection) {
	if (!connection || typeof connection.host !== "string") {
		return "new";
	}

	var host = connection.host.trim().toLowerCase();
	if (!host) {
		return "new";
	}

	return normalizeUsername(connection.username).toLowerCase() + "@" + host + ":" + normalizePort(connection.port);
}

function formatConnectionLabel(connection) {
	return normalizeUsername(connection.username) + "@" + connection.host + ":" + normalizePort(connection.port);
}

export function ConnectPage() {
	var ctx = useAppState();
	var dispatch = ctx.dispatch;

	var [recentConnections, setRecentConnections] = useState(function () {
		return loadRecentConnections();
	});
	var [selectedConnectionKey, setSelectedConnectionKey] = useState(function () {
		return recentConnections.length ? getConnectionKey(recentConnections[0]) : "new";
	});
	var [draftConnection, setDraftConnection] = useState(function () {
		return createDraftConnection();
	});
	var selectedRecentConnection = null;
	for (var i = 0; i < recentConnections.length; i += 1) {
		if (getConnectionKey(recentConnections[i]) === selectedConnectionKey) {
			selectedRecentConnection = recentConnections[i];
			break;
		}
	}
	var usingSavedConnection = !!selectedRecentConnection;
	var activeConnection = usingSavedConnection ? selectedRecentConnection : draftConnection;

	var [authMethod, setAuthMethod] = useState("password");
	var [connecting, setConnecting] = useState(false);
	var [error, setError] = useState("");
	var [showPassword, setShowPassword] = useState(false);
	var [credentials, setCredentials] = useState({
		password: "",
		privateKey: "",
	});

	function updateDraftConnection(field, value) {
		setDraftConnection(function (prev) {
			return Object.assign({}, prev, { [field]: value });
		});
	}

	function updateCredentials(field, value) {
		setCredentials(function (prev) {
			return Object.assign({}, prev, { [field]: value });
		});
	}

	function resetSensitiveFields() {
		setCredentials({ password: "", privateKey: "" });
		setShowPassword(false);
	}

	function handleSelectRecentConnection(connection) {
		setSelectedConnectionKey(getConnectionKey(connection));
		resetSensitiveFields();
		setError("");
	}

	function handleSelectNewSession() {
		setSelectedConnectionKey("new");
		resetSensitiveFields();
		setError("");
	}

	function handleRemoveRecentConnection(connection) {
		var removedKey = getConnectionKey(connection);
		var next = removeRecentConnection(connection);
		setRecentConnections(next);
		setError("");

		if (selectedConnectionKey === removedKey) {
			resetSensitiveFields();
			if (next.length) {
				setSelectedConnectionKey(getConnectionKey(next[0]));
			} else {
				setSelectedConnectionKey("new");
				setDraftConnection(createDraftConnection());
			}
		}
	}

	function handleFileLoad(e) {
		var file = e.target.files && e.target.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onload = function (ev) {
			updateCredentials("privateKey", ev.target.result);
		};
		reader.readAsText(file);
	}

	function handleSubmit(e) {
		e.preventDefault();
		setError("");

		var host = activeConnection.host.trim();
		var username = activeConnection.username.trim();
		if (!host || !username) {
			setError("Host and username are required.");
			return;
		}

		var payload = { host: host, port: normalizePort(activeConnection.port), username: username, authMethod: authMethod };
		if (authMethod === "password") payload.password = credentials.password;
		else payload.privateKey = credentials.privateKey.trim();

		setConnecting(true);

		api.connect(payload)
			.then(function (snapshot) {
				var nextConnections = saveRecentConnection({
					host: payload.host,
					port: payload.port,
					username: payload.username,
				});
				setRecentConnections(nextConnections);
				setSelectedConnectionKey(getConnectionKey(payload));
				dispatch({ type: "SET_SESSION", payload: snapshot });
				return loadAddonsData(snapshot, dispatch);
			})
			.then(function () {
				dispatch({ type: "NAVIGATE", payload: { page: "dashboard" } });
			})
			.catch(function (err) {
				setError(err.message);
				setConnecting(false);
			});
	}

	var activeBtn = "flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors bg-primary-container text-on-primary-container border-primary";
	var inactiveBtn = "flex-1 py-xs text-center font-label-caps text-label-caps rounded-lg border transition-colors bg-surface-container text-on-surface-variant border-outline-variant";
	var selectedChipClass = "flex items-center gap-sm px-sm py-sm rounded-lg border border-primary bg-primary-container text-on-primary-container transition-colors";
	var unselectedChipClass = "flex items-center gap-sm px-sm py-sm rounded-lg border border-outline-variant bg-surface-container text-on-surface hover:border-primary transition-colors";

	var recentConnectionsPanel = recentConnections.length
		? React.createElement(
				"div",
				{ className: "flex flex-col gap-xs" },
				React.createElement("h3", { className: "font-label-caps text-label-caps text-on-surface-variant" }, "Recent sessions"),
				React.createElement(
					"button",
					{
						type: "button",
						className: selectedConnectionKey === "new" ? selectedChipClass : unselectedChipClass,
						onClick: handleSelectNewSession,
					},
					React.createElement("span", { className: "material-symbols-outlined shrink-0", style: { fontSize: "18px" } }, selectedConnectionKey === "new" ? "add_circle" : "add"),
					React.createElement(
						"div",
						{ className: "flex-1 text-left min-w-0" },
						React.createElement("div", { className: "font-body-md text-body-md" }, "New Session"),
						React.createElement("div", { className: "font-body-sm text-body-sm opacity-80" }, "Show the full connection form"),
					),
				),
				recentConnections.map(function (connection) {
					var connectionKey = getConnectionKey(connection);
					var selected = selectedConnectionKey === connectionKey;
					var buttonClass = selected ? selectedChipClass : unselectedChipClass;

					return React.createElement(
						"div",
						{ key: connectionKey, className: "flex items-center gap-xs" },
						React.createElement(
							"button",
							{
								type: "button",
								className: buttonClass + " flex-1",
								onClick: function () {
									handleSelectRecentConnection(connection);
								},
							},
							React.createElement("span", { className: "material-symbols-outlined shrink-0", style: { fontSize: "18px" } }, selected ? "check_circle" : "history"),
							React.createElement(
								"div",
								{ className: "flex-1 min-w-0 text-left" },
								React.createElement("div", { className: "font-body-md text-body-md truncate" }, connection.username + "@" + connection.host + ":" + connection.port),
							),
						),
						React.createElement(
							"button",
							{
								"type": "button",
								"className":
									"w-10 h-10 shrink-0 rounded-lg border border-outline-variant bg-surface-container text-on-surface-variant hover:text-error hover:border-error transition-colors flex items-center justify-center",
								"onClick": function () {
									handleRemoveRecentConnection(connection);
								},
								"aria-label": "Delete saved session " + formatConnectionLabel(connection),
								"style": {
									height: "stretch",
								},
							},
							React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "18px" } }, "delete"),
						),
					);
				}),
			)
		: null;

	var selectedSessionSummary = usingSavedConnection
		? React.createElement(
				"div",
				{ className: "rounded-xl border border-outline-variant bg-surface-container p-md flex items-start gap-sm" },
				React.createElement("span", { className: "material-symbols-outlined text-primary shrink-0", style: { fontSize: "22px" } }, "link"),
				React.createElement(
					"div",
					{ className: "min-w-0" },
					React.createElement("div", { className: "font-label-caps text-label-caps text-on-surface-variant mb-xs" }, "Selected session"),
					React.createElement("div", { className: "font-code-block text-code-block text-on-surface break-all" }, formatConnectionLabel(selectedRecentConnection)),
					React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant mt-xs" }, "Enter only the password or SSH key to reconnect."),
				),
			)
		: null;

	var shouldShowFullConnectionForm = !recentConnections.length || !usingSavedConnection;

	return React.createElement(
		"div",
		{ className: "bg-background text-on-background min-h-screen flex flex-col" },
		React.createElement(Topbar, { connected: false }),
		React.createElement(
			"main",
			{ className: "flex-1 flex items-center justify-center p-margin-desktop" },
			React.createElement(
				"div",
				{ className: "flex gap-xl w-full", style: { maxWidth: "960px" } },

				// Left: branding + tips
				React.createElement(
					"div",
					{ className: "flex-1 hidden md:flex flex-col justify-center pr-xl" },
					React.createElement(
						"div",
						{ className: "flex items-center gap-sm mb-lg" },
						React.createElement(
							"div",
							{ className: "w-10 h-10 rounded bg-primary flex items-center justify-center text-on-primary" },
							React.createElement("span", { className: "material-symbols-outlined" }, "terminal"),
						),
						React.createElement("h1", { className: "font-display-sm text-display-sm text-on-surface" }, "VPS Manager"),
					),
					React.createElement("p", { className: "font-body-lg text-body-lg text-on-surface-variant mb-xl" }, "Manage your server infrastructure with add-ons and an integrated terminal."),
					React.createElement(
						"ul",
						{ className: "flex flex-col gap-md" },
						React.createElement(Tip, { icon: "extension", title: "Add-on ecosystem", body: "Install and manage nginx, Docker, MySQL and many other services via XML-driven add-ons." }),
						React.createElement(Tip, { icon: "terminal", title: "Integrated terminal", body: "Every command execution is streamed in real time to the built-in terminal panel." }),
						React.createElement(Tip, { icon: "lock", title: "Secure connection", body: "Connects over SSH using password or private key — credentials are never stored locally." }),
					),
				),

				// Right: form card
				React.createElement(
					"div",
					{ className: "w-full md:w-96 shrink-0" },
					React.createElement(
						"div",
						{ className: "bg-surface-container-low border border-outline-variant rounded-2xl p-xl flex flex-col gap-md" },
						React.createElement(
							"div",
							{ className: "flex flex-col gap-xs mb-xs" },
							React.createElement("h2", { className: "font-headline-sm text-headline-sm text-on-surface" }, "SSH Connection"),
							React.createElement("p", { className: "font-body-md text-body-md text-on-surface-variant" }, "Only host, port and username are stored locally."),
						),
						recentConnectionsPanel,
						React.createElement(
							"form",
							{ onSubmit: handleSubmit, className: "flex flex-col gap-md" },
							selectedSessionSummary,

							// Host + Port
							shouldShowFullConnectionForm
								? React.createElement(
										React.Fragment,
										null,
										React.createElement(
											"div",
											{ className: "flex gap-sm" },
											React.createElement(
												"div",
												{ className: "flex-1" },
												React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Host"),
												React.createElement("input", {
													type: "text",
													placeholder: "192.168.1.1",
													autoComplete: "off",
													value: draftConnection.host,
													onChange: function (e) {
														updateDraftConnection("host", e.target.value);
													},
													className:
														"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary",
												}),
											),
											React.createElement(
												"div",
												{ style: { width: "90px" } },
												React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Port"),
												React.createElement("input", {
													type: "number",
													min: "1",
													max: "65535",
													value: draftConnection.port,
													onChange: function (e) {
														updateDraftConnection("port", e.target.value);
													},
													className:
														"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary",
												}),
											),
										),
										React.createElement(
											"div",
											null,
											React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Username"),
											React.createElement("input", {
												type: "text",
												autoComplete: "off",
												value: draftConnection.username,
												onChange: function (e) {
													updateDraftConnection("username", e.target.value);
												},
												className:
													"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary",
											}),
										),
									)
								: null,

							// Auth method
							React.createElement(
								"div",
								null,
								React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Auth Method"),
								React.createElement(
									"div",
									{ className: "flex gap-xs" },
									React.createElement(
										"button",
										{
											type: "button",
											className: authMethod === "password" ? activeBtn : inactiveBtn,
											onClick: function () {
												setAuthMethod("password");
											},
										},
										"Password",
									),
									React.createElement(
										"button",
										{
											type: "button",
											className: authMethod === "sshkey" ? activeBtn : inactiveBtn,
											onClick: function () {
												setAuthMethod("sshkey");
											},
										},
										"SSH Key",
									),
								),
							),

							// Password section
							authMethod === "password"
								? React.createElement(
										"div",
										null,
										React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Password"),
										React.createElement(
											"div",
											{ className: "relative" },
											React.createElement("input", {
												type: showPassword ? "text" : "password",
												autoComplete: "current-password",
												value: credentials.password,
												onChange: function (e) {
													updateCredentials("password", e.target.value);
												},
												className:
													"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full pr-10 outline-none focus:border-primary",
											}),
											React.createElement(
												"button",
												{
													type: "button",
													className: "absolute right-xs top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors",
													onClick: function () {
														setShowPassword(function (v) {
															return !v;
														});
													},
												},
												React.createElement("span", { className: "material-symbols-outlined" }, showPassword ? "visibility_off" : "visibility"),
											),
										),
									)
								: null,

							// SSH Key section
							authMethod === "sshkey"
								? React.createElement(
										"div",
										{ className: "flex flex-col gap-sm" },
										React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Private Key"),
										React.createElement("textarea", {
											rows: 5,
											placeholder: "-----BEGIN RSA PRIVATE KEY-----",
											value: credentials.privateKey,
											onChange: function (e) {
												updateCredentials("privateKey", e.target.value);
											},
											className:
												"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary resize-none",
										}),
										React.createElement(
											"label",
											{ className: "flex items-center gap-xs text-on-surface-variant hover:text-on-surface font-label-caps text-label-caps transition-colors cursor-pointer" },
											React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "16px" } }, "upload_file"),
											"Load from file",
											React.createElement("input", { type: "file", accept: ".pem,.key,.pub,*", className: "hidden", onChange: handleFileLoad }),
										),
									)
								: null,

							// Error
							error ? React.createElement("div", { className: "font-code-block text-code-block text-error bg-error-container rounded-lg px-sm py-xs" }, error) : null,

							// Submit
							React.createElement(
								"button",
								{
									type: "submit",
									disabled: connecting,
									className:
										"w-full py-sm bg-primary text-on-primary rounded-lg font-label-caps text-label-caps hover:bg-primary-fixed transition-colors flex items-center justify-center gap-xs",
								},
								connecting
									? React.createElement(
											React.Fragment,
											null,
											React.createElement("span", { className: "material-symbols-outlined animate-spin", style: { fontSize: "18px" } }, "sync"),
											"Connecting…",
										)
									: React.createElement(
											React.Fragment,
											null,
											React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "18px" } }, "link"),
											"Connect",
										),
							),
						),
					),
				),
			),
		),
	);
}
