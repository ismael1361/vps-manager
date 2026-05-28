/* ================================================
   VPS Manager — Página de Autenticação (sem JSX)
   ================================================ */
import React, { useState, useEffect } from "https://esm.sh/react@18";
import { useAppState } from "../store.js";
import { api } from "../api.js";
import { saveLastConnection, loadLastConnection } from "../utils.js";
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

export function ConnectPage() {
	var ctx = useAppState();
	var dispatch = ctx.dispatch;

	var last = loadLastConnection();

	var [authMethod, setAuthMethod] = useState((last && last.authMethod) || "password");
	var [connecting, setConnecting] = useState(false);
	var [error, setError] = useState("");
	var [showPassword, setShowPassword] = useState(false);
	var [form, setForm] = useState({
		host: (last && last.host) || "",
		port: (last && last.port) || 22,
		username: (last && last.username) || "root",
		password: "",
		privateKey: (last && last.privateKey) || "",
	});

	function updateForm(field, value) {
		setForm(function (prev) {
			return Object.assign({}, prev, { [field]: value });
		});
	}

	function handleFileLoad(e) {
		var file = e.target.files && e.target.files[0];
		if (!file) return;
		var reader = new FileReader();
		reader.onload = function (ev) {
			updateForm("privateKey", ev.target.result);
		};
		reader.readAsText(file);
	}

	function handleSubmit(e) {
		e.preventDefault();
		setError("");

		var host = form.host.trim();
		var username = form.username.trim();
		if (!host || !username) {
			setError("Host and username are required.");
			return;
		}

		var payload = { host: host, port: parseInt(form.port, 10) || 22, username: username, authMethod: authMethod };
		if (authMethod === "password") payload.password = form.password;
		else payload.privateKey = form.privateKey.trim();

		setConnecting(true);

		api.connect(payload)
			.then(function (snapshot) {
				saveLastConnection({
					host: payload.host,
					port: payload.port,
					username: payload.username,
					authMethod: authMethod,
					privateKey: authMethod === "sshkey" ? payload.privateKey : "",
				});
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

	var lastBadge = last
		? React.createElement(
				"div",
				{ className: "flex items-center gap-xs px-sm py-xs bg-surface-container-highest border border-outline-variant rounded text-on-surface-variant font-code-block text-code-block" },
				React.createElement("span", { className: "material-symbols-outlined", style: { fontSize: "14px" } }, "history"),
				"Last: ",
				React.createElement("span", { className: "text-on-surface" }, last.username + "@" + last.host + ":" + last.port),
			)
		: null;

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
							{ className: "justify-between items-center mb-xs" },
							React.createElement("h2", { className: "font-headline-sm text-headline-sm text-on-surface" }, "SSH Connection"),
							lastBadge,
						),
						React.createElement(
							"form",
							{ onSubmit: handleSubmit, className: "flex flex-col gap-md" },

							// Host + Port
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
										value: form.host,
										onChange: function (e) {
											updateForm("host", e.target.value);
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
										value: form.port,
										onChange: function (e) {
											updateForm("port", e.target.value);
										},
										className:
											"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary",
									}),
								),
							),

							// Username
							React.createElement(
								"div",
								null,
								React.createElement("label", { className: "font-label-caps text-label-caps text-on-surface-variant block mb-xs" }, "Username"),
								React.createElement("input", {
									type: "text",
									autoComplete: "off",
									value: form.username,
									onChange: function (e) {
										updateForm("username", e.target.value);
									},
									className:
										"bg-surface-container border border-outline-variant rounded-lg px-sm py-xs font-code-block text-code-block text-on-surface w-full outline-none focus:border-primary",
								}),
							),

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
												value: form.password,
												onChange: function (e) {
													updateForm("password", e.target.value);
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
											value: form.privateKey,
											onChange: function (e) {
												updateForm("privateKey", e.target.value);
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
