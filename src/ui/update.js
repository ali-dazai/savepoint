// S29: service worker registration and the "new version ready" banner.
import { $ } from "../core/util.js";

let swReg = null;
function showUpdateBanner() {
  if ($(".update-bar")) return;
  const el = document.createElement("div");
  el.className = "update-bar"; el.setAttribute("role", "status");
  el.innerHTML = `<span>A new version of Save Point is ready.</span><button class="btn" data-act="update-refresh">Refresh</button>`;
  document.body.appendChild(el);
}
export function applyUpdate() {
  if (swReg && swReg.waiting) swReg.waiting.postMessage({ type: "SKIP_WAITING" });
  else location.reload();
}

export function checkForUpdate() { if (swReg) swReg.update().catch(() => {}); }

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(); });
      });
    }).catch(() => {});
  });
}
