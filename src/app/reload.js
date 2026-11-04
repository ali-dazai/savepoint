// Fetch everything, reindex, redraw. Deliberately loads all rows at once (decision D5: a friend group's data is tiny).
import { S, reindex } from "../core/state.js";
import { maintainCatalog } from "../features/catalog/upkeep.js";
import { loadDiscover } from "../features/discover/load.js";
import { loadSimilar } from "../features/picks/picks.js";
import { renderMain } from "../ui/screen.js";
import { refreshOpenSheet } from "../ui/sheet.js";

export async function reload() {
  const data = await S.api.loadAll();
  S.profiles = data.profiles;
  S.games = data.games;
  S.entries = data.entries;
  S.catalog = data.catalog || [];
  S.lastLoad = Date.now();
  reindex();
  renderMain();
  refreshOpenSheet();
  loadSimilar();
  maintainCatalog();
  if (S.tab === "discover") loadDiscover();
}

// For background refreshes (live updates, coming back to the app, re-tapping a tab): a failed load, e.g. while
// offline, keeps the screen as it is instead of surfacing as an unhandled promise rejection.
export function reloadQuietly() {
  return reload().catch(() => {});
}
