import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./styles.css";
import { App } from "./app";
import { isNative } from "./notify/native";

const root = document.getElementById("app");
if (root) new App(root).start();

// the APK serves its files locally, so the service worker is only for the web version
if ("serviceWorker" in navigator && import.meta.env.PROD && !isNative()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is a bonus, never a requirement */
    });
  });
}
