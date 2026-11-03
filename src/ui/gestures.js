// Touch: hold a case to add an hour, swipe a sheet down or a page right to go back, pull to refresh.
import { reload } from "../app/reload.js";
import { S } from "../core/state.js";
import { $ } from "../core/util.js";
import { quickHours } from "../features/game/log.js";
import { toast } from "./feedback.js";
import { goBack } from "./sheet.js";

let hold = null, suppressClick = false;
// Called by the click wiring: a tap that ended a hold must not also open the case.
export function swallowHoldClick(ev) {
  if (suppressClick && ev.target.closest(".case-btn")) { suppressClick = false; ev.preventDefault(); return true; }
  return false;
}
document.addEventListener("pointerdown", (ev) => {
  const b = ev.target.closest(".case-btn[data-hold]");
  if (!b || (ev.pointerType === "mouse" && ev.button !== 0)) return;
  endHold();
  const id = b.dataset.id;
  b.classList.add("holding");
  hold = { b, x: ev.clientX, y: ev.clientY, t: setTimeout(() => {
    hold.fired = true;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 700);
    if (navigator.vibrate) navigator.vibrate(12);
    quickHours(id, 1, { undo: true });
    const nb = $(`.case-btn[data-id="${id}"]`); // the wall re-rendered: bump the new case
    if (nb) { nb.classList.add("bump"); setTimeout(() => nb.classList.remove("bump"), 500); }
  }, 450) };
});
function endHold() {
  if (!hold) return;
  clearTimeout(hold.t);
  hold.b.classList.remove("holding");
  hold = null;
}
document.addEventListener("pointermove", (ev) => { if (hold && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 10) endHold(); });
document.addEventListener("pointerup", endHold);
document.addEventListener("pointercancel", endHold);
document.addEventListener("contextmenu", (ev) => { if (ev.target.closest(".case-btn")) ev.preventDefault(); });

// ---------------- S19: gestures ----------------
// Swipe a sheet down to close it; swipe a game page right from the left edge to go back; pull the main screen to refresh.
let drag = null;
document.addEventListener("touchstart", (ev) => {
  const t0 = ev.touches[0];
  const page = ev.target.closest(".page");
  if (page) {
    if (t0.clientX > 32 || ev.target.closest("input, textarea, select, .star-input")) return;
    drag = { kind: "page", el: page, x0: t0.clientX, y0: t0.clientY, t0: Date.now(), dx: 0, locked: false };
    return;
  }
  const sheet = ev.target.closest(".sheet");
  if (sheet) {
    if (sheet.scrollTop > 0 || ev.target.closest("textarea, input, select, .star-input")) return;
    drag = { kind: "sheet", el: sheet, y0: t0.clientY, x0: t0.clientX, t0: Date.now(), dy: 0 };
    return;
  }
  if (S.sheet || !S.me || !$("#main") || window.scrollY > 0 || $(".backdrop")) return;
  drag = { kind: "ptr", y0: t0.clientY, x0: t0.clientX, dy: 0 };
}, { passive: true });
document.addEventListener("touchmove", (ev) => {
  if (!drag) return;
  const dy = ev.touches[0].clientY - drag.y0, dx = ev.touches[0].clientX - drag.x0;
  if (drag.kind === "page") {
    if (!drag.locked) {
      if (Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.locked = true;
    }
    drag.dx = Math.max(0, dx);
    if (ev.cancelable) ev.preventDefault();
    drag.el.style.transition = "none"; drag.el.style.transform = `translateX(${drag.dx}px)`;
    return;
  }
  if (drag.dy === 0 && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }
  if (dy <= 0) { if (drag.kind === "sheet") drag.el.style.transform = ""; drag.dy = 0; updatePtr(0); return; }
  drag.dy = dy;
  if (ev.cancelable) ev.preventDefault();
  if (drag.kind === "sheet") { drag.el.style.transition = "none"; drag.el.style.transform = `translateY(${dy}px)`; }
  else updatePtr(dy);
}, { passive: false });
document.addEventListener("touchend", () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.kind === "page") {
    const fast = d.dx / Math.max(1, Date.now() - d.t0) > 0.5;
    d.el.style.transition = "transform 0.2s ease";
    if (d.dx > 100 || (fast && d.dx > 40)) { d.el.style.transform = "translateX(100%)"; setTimeout(goBack, 180); }
    else d.el.style.transform = "";
  } else if (d.kind === "sheet") {
    const fast = d.dy / Math.max(1, Date.now() - d.t0) > 0.6;
    d.el.style.transition = "transform 0.2s ease";
    if (d.dy > 110 || (fast && d.dy > 40)) { d.el.style.transform = "translateY(100%)"; setTimeout(goBack, 180); }
    else d.el.style.transform = "";
  } else {
    if (d.dy > 70) { updatePtr(70, "Refreshing…"); reload().catch(() => toast("Couldn't refresh. Check your connection.")).finally(() => updatePtr(0)); }
    else updatePtr(0);
  }
});
function updatePtr(dy, label) {
  const el = $("#ptr");
  if (!el) return;
  const h = Math.min(dy, 90);
  el.style.height = h + "px";
  el.classList.toggle("ready", dy > 70);
  el.firstElementChild.textContent = label || (dy > 70 ? "Release to refresh" : "Pull to refresh");
}
