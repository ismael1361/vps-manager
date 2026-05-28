/* ================================================
   VPS Manager — Lightweight client-side router
   ================================================ */
var handlers = {};

export function register(name, fn) {
	handlers[name] = fn;
}

export function navigate(name) {
	var args = Array.prototype.slice.call(arguments, 1);
	if (handlers[name]) handlers[name].apply(null, args);
}
