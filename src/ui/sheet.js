// Sheets and pages in #layer: open/close/back stack, the frames, and re-rendering without losing scroll.
import { sheets } from "../app/registry.js";
import { ICON } from "../core/constants.js";
import { S } from "../core/state.js";
import { $, esc } from "../core/util.js";
import { layer } from "./screen.js";
import { manualVars, styleVars } from "./theme.js";

export function openSheet(sheet, push) {
  S.back = push && S.sheet ? S.sheet : null;
  if (S.share && sheet.kind !== "share") { try { if (S.share.url) URL.revokeObjectURL(S.share.url); } catch (_) {} S.share = null; }
  S.sheet = sheet;
  renderSheet();
  const def = sheets[sheet.kind];
  if (def && def.onOpen) def.onOpen(sheet);
}
export function closeSheet() {
  if (S.share && S.share.url) { try { URL.revokeObjectURL(S.share.url); } catch (_) {} }
  S.share = null;
  S.sheet = null; S.draft = null; S.back = null;
  layer().innerHTML = "";
  document.body.style.overflow = "";
}
export function goBack() {
  if (!S.back) return closeSheet();
  const b = S.back;
  S.back = null; S.draft = null;
  openSheet(b, false);
}
// After a data reload: let the open sheet update its read-only parts (a half-filled form is never wiped).
export function refreshOpenSheet() {
  if (!S.sheet) return;
  const def = sheets[S.sheet.kind];
  if (def && def.refresh) def.refresh(S.sheet);
}
export function sheetFrame(title, inner, label) {
  return `<div class="backdrop" data-act="backdrop">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title)}">
      <div class="grabber"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn round secondary" data-act="close" aria-label="Close">${ICON.close}</button></div>
      ${inner}
    </div></div>`;
}
// A game page: the header is the opened case (disc in the tray), the body is the manual, a light paper sheet.
export function pageFrame(label, head, body, { tint, hs }) {
  const opening = S.sheet && !S.sheet.opened;
  if (S.sheet) S.sheet.opened = true;
  return `<div class="page${opening ? " opening" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}" style="--hb:${tint.bg};--hm:${tint.soft}">
    <div class="page-inner">${head}<div class="booklet" style="${styleVars(manualVars(hs[0], hs[1]))}"><div class="g-body">${body}</div></div></div></div>`;
}
export function caseHead({ url, tint, title }) {
  const img = url ? `<img src="${esc(url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const name = `<span class="cv-t">${esc(title)}</span>`;
  return `<div class="open-case" aria-hidden="true" style="--t:${tint.tile};--tm:${tint.soft}">
    <div class="tray"><div class="disc"><div class="label">${img || name}</div><span class="hub"></span></div></div>
    <div class="lid">
      <div class="face back"><span class="clip" style="top:9%"></span><span class="clip" style="bottom:9%"></span><div class="ins">${img}</div></div>
      <div class="face front"><div class="ins">${img || name}</div></div>
    </div>
  </div>`;
}
export function pageHead({ title, art, meta, chips, right }) {
  return `<header class="g-head">
    <div class="g-nav"><button class="btn round glass" data-act="close" aria-label="Back">${ICON.back}</button>${right || ""}</div>
    ${caseHead(art)}
    <div><h1>${esc(title)}</h1>${meta ? `<div class="g-meta">${esc(meta)}</div>` : ""}</div>
    <div id="chips">${chips}</div>
  </header>`;
}
export function renderSheet() {
  const sh = S.sheet;
  if (!sh) return;
  const def = sheets[sh.kind];
  layer().innerHTML = def ? def.render(sh) : "";
  document.body.style.overflow = "hidden";
  const pg = $(".page.opening"); // the case-opening plays once; its end state is the page's resting state
  if (pg) setTimeout(() => pg.classList.remove("opening"), 900);
  const first = $("#layer [autofocus]");
  if (first && !matchMedia("(pointer: coarse)").matches) first.focus();
}
export function scroller() { return $(".page") || $(".sheet"); }
export function rerenderKeepScroll() {
  const el = scroller();
  const top = el ? el.scrollTop : 0;
  renderSheet();
  const el2 = scroller(); if (el2) el2.scrollTop = top;
}
