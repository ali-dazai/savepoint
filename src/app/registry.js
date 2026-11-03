// Registries the shell renders from, so features plug in without the shell importing them.
// main.js registers every feature once at start-up. Adding a feature means adding a registration, not editing the shell.

// Tabs in display order: { id, label, view() } where view() returns the tab's HTML. The icon comes from ICON[id].
export const tabs = [];
// Sheets and pages by kind: { render(sheet), onOpen?(sheet), refresh?(sheet) }.
//   render  → HTML for #layer.  onOpen → after first render (e.g. start a lookup).  refresh → after a data reload.
export const sheets = {};
// data-act="…" → fn(el, ev), and form[data-form="…"] → async fn(form).
export const actions = {};
export const forms = {};

export function registerTab(tab) { tabs.push(tab); }
export function registerSheet(kind, def) { sheets[kind] = def; }
export function registerActions(map) { Object.assign(actions, map); }
export function registerForms(map) { Object.assign(forms, map); }
