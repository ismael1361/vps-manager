/* ================================================
   VPS Manager — Entry point (React + ES Modules)
   ================================================ */
import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { AppProvider } from "./store.js";
import { App } from "./App.js";

var root = createRoot(document.getElementById("app"));
root.render(React.createElement(AppProvider, null, React.createElement(App)));
