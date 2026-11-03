// Keeps catalogue rows fresh in the background and looks up Steam scores on demand.
import { DAY_MS } from "../../core/constants.js";
import { S, catOf, catRow, idx, reindex, releaseInfo } from "../../core/state.js";
import { updatePageChips } from "../game/page.js";
import { safeRenderMain } from "../../ui/screen.js";
import { refreshOpenSheet } from "../../ui/sheet.js";

const STEAM_KEYS = ["steam_desc", "steam_pct", "steam_total", "steam_players", "steam_fetched_at"];
function mergeCatalog(rows) {
  (rows || []).forEach((r) => {
    if (!r || !r.igdb_id) return;
    const i = S.catalog.findIndex((x) => x.igdb_id === r.igdb_id);
    if (i < 0) {
      S.catalog.push(r);
      return;
    }
    const old = S.catalog[i],
      next = { ...old, ...r };
    // Never let an older copy wipe Steam numbers we fetched more recently.
    if (old.steam_fetched_at && (!r.steam_fetched_at || r.steam_fetched_at < old.steam_fetched_at))
      STEAM_KEYS.forEach((k) => (next[k] = old[k]));
    S.catalog[i] = next;
  });
  reindex();
}

// Keeps catalogue rows fresh: wishlist games that aren't out yet (release dates move), and covers without a tint colour.
let maintaining = false;
export async function maintainCatalog() {
  if (maintaining || !S.api || !S.api.catalogRefresh) return;
  const ids = [];
  S.games.forEach((g) => {
    const c = catOf(g);
    if (!c || S.refreshed.has(c.igdb_id)) return;
    const age = c.fetched_at ? Date.now() - new Date(c.fetched_at).getTime() : Infinity;
    const wanted = (idx.byGame[g.id] || []).some((e) => e.status === "want");
    const rel = releaseInfo(c);
    const upcoming = rel ? rel.upcoming : !c.first_release_date;
    if ((wanted && upcoming && age > DAY_MS) || (c.cover_image_id && !c.cover_color)) ids.push(c.igdb_id);
  });
  if (!ids.length) return;
  const batch = ids.slice(0, 25);
  batch.forEach((i) => S.refreshed.add(i));
  maintaining = true;
  try {
    mergeCatalog(await S.api.catalogRefresh(batch));
    safeRenderMain();
    refreshOpenSheet();
  } catch (_) {
    /* try again next session */
  } finally {
    maintaining = false;
  }
}

// S35: Steam review score + players online, looked up when a game page opens (the server caches it for a day).
export async function ensureSteam(igdbId) {
  const c = catRow(igdbId);
  if (!c || !c.steam_appid || !S.api.catalogSteam || S.steamTried.has(igdbId)) return;
  if (c.steam_fetched_at && Date.now() - new Date(c.steam_fetched_at).getTime() < DAY_MS) return;
  S.steamTried.add(igdbId);
  S.steamLoading.add(igdbId);
  updatePageChips();
  try {
    const st = await S.api.catalogSteam(igdbId);
    const live = catRow(igdbId) || c; // the row may have been replaced by a refresh while we waited
    if (st)
      Object.assign(live, {
        steam_desc: st.desc,
        steam_pct: st.pct,
        steam_total: st.total,
        steam_players: st.players,
        steam_fetched_at: st.fetched_at || new Date().toISOString(),
      });
  } catch (_) {
    /* the chip just doesn't show */
  }
  S.steamLoading.delete(igdbId);
  updatePageChips();
}
