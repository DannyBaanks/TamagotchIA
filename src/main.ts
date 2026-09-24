import "@fontsource/fredoka/400.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/fredoka/700.css";
import "./styles.css";
import { App } from "./app";

const root = document.getElementById("app");
if (root) new App(root).start();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is a bonus, never a requirement */
    });
  });
}
