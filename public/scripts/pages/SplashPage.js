/* ================================================
   VPS Manager — Splash screen inicial
   ================================================ */
import React from "https://esm.sh/react@18";

export function SplashPage() {
	return React.createElement(
		"div",
		{ className: "bg-background text-on-background min-h-screen flex items-center justify-center p-margin-desktop" },
		React.createElement(
			"div",
			{ className: "w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-low p-xl flex flex-col items-center text-center gap-md" },
			React.createElement(
				"div",
				{ className: "w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center" },
				React.createElement("span", { className: "material-symbols-outlined animate-spin", style: { fontSize: "28px" } }, "sync"),
			),
			React.createElement("span", { className: "font-label-caps text-label-caps text-primary" }, "VPS Manager"),
			React.createElement("h1", { className: "font-headline-sm text-headline-sm text-on-surface" }, "Checking active session"),
			React.createElement(
				"p",
				{ className: "font-body-md text-body-md text-on-surface-variant" },
				"Verifying whether there is already an active SSH connection before opening the dashboard.",
			),
		),
	);
}