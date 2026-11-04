// Confirm dialog, toasts and the busy-button helper.
import { $, esc } from "../core/util.js";

export function confirmDialog({ title, body, ok, danger }) {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "backdrop";
    el.style.alignItems = "center";
    el.style.zIndex = "50";
    el.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
      <h2 id="dlg-t">${esc(title)}</h2><p>${esc(body)}</p>
      <div class="row"><button class="btn secondary" data-r="0">Cancel</button><button class="btn" data-r="1" style="${danger ? "background:var(--danger);color:#000" : ""}">${esc(ok)}</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('[data-r="1"]').focus();
    const done = (answer) => {
      document.removeEventListener("keydown", onKey);
      el.remove();
      resolve(answer);
    };
    // Escape cancels, like tapping outside. (The sheet behind must not also close: see the Escape rule in wiring.)
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        done(false);
      }
    };
    document.addEventListener("keydown", onKey);
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-r]");
      if (b || ev.target === el) done(!!(b && b.dataset.r === "1"));
    });
  });
}
let toastTimer;
// action: optional { label, fn } button in the toast (e.g. Undo).
export function toast(msg, action) {
  let t = $(".toast");
  if (!t) {
    t = document.createElement("div");
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.className = "toast" + (action ? "" : " plain");
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
  if (action)
    t.querySelector("button").addEventListener("click", () => {
      clearTimeout(toastTimer);
      t.remove();
      action.fn();
    });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 4500 : 2400);
}

export async function busy(btn, fn) {
  if (btn) {
    btn.disabled = true;
  }
  try {
    return await fn();
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
}
