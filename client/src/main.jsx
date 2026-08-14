import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

function registerServiceWorker() {
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    // When a new deploy is waiting, activate it so nobody is stuck on an old build
    // after a fix ships.
    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          installing.postMessage("SKIP_WAITING");
        }
      });
    });
  }).catch((error) => {
    // Swallowing this silently hid a registration failure in production.
    console.warn("Service worker registration failed:", error);
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  // This module is a deferred ES module, so `load` has usually already fired by the time
  // it runs — waiting for the event meant the listener never fired and the app was never
  // installable in production. Register straight away when the page is already loaded.
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker, { once: true });
}
