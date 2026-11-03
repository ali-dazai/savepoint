// The main screen: renders the active tab into #app with the floating tab bar.
import { ICON } from "../core/constants.js";
import { tabs } from "../core/registry.js";
import { S } from "../core/state.js";
import { $, esc } from "../core/util.js";
import { markHTML } from "./cover.js";
import { applyWall } from "./theme.js";

export const root = () => $("#app");
export const layer = () => $("#layer");

export function renderMain() {
  const keepScroll = window.scrollY;
  applyWall();
  const tab = tabs.find((t) => t.id === S.tab) || tabs[0];
  const body = tab.view();
  root().innerHTML = `
    <div class="ptr" id="ptr" aria-hidden="true"><span>Pull to refresh</span></div>
    <main class="screen" id="main">
      ${S.api.demo ? `<div class="demo-bar"><span>Demo mode: changes stay on this device.</span><button data-act="exit-demo">Exit demo</button></div>` : ""}
      ${body}
    </main>
    <nav class="tabbar" aria-label="Sections"><div class="tabbar-inner">
      ${tabs.map((t) => `<button data-act="tab" data-tab="${t.id}" aria-label="${t.label}" ${S.tab === t.id ? 'aria-current="page"' : ""}>${ICON[t.id]}<span>${t.label}</span></button>`).join("")}
    </div></nav>`;
  window.scrollTo(0, keepScroll);
}
// Re-render without yanking the keyboard away from someone typing in a search box.
export function safeRenderMain() {
  // Background updates only refresh the main screens; they must never cover sign-in (e.g. demo data arriving after Exit demo).
  if (!S.me || !$("#main")) return;
  const a = document.activeElement;
  if (a && a.closest && a.closest("#main") && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  renderMain();
}

export function topbar(title, add = true) {
  return `<header class="topbar"><h1 class="big-title">${esc(title)}</h1>
    ${add ? `<button class="btn round" data-act="add-game" aria-label="Add a game">${ICON.plus}</button>` : ""}</header>`;
}

export function emptyState(title, body, cta) {
  return `<div class="empty">${markHTML()}<h3>${esc(title)}</h3><p>${esc(body)}</p>
    ${cta ? `<button class="btn" data-act="add-game">${esc(cta)}</button>` : ""}</div>`;
}
