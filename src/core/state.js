// The single app state object `S`, the index `idx` rebuilt from it, and the derived lookups every screen uses.
import { IGDB_IMG, MY_VERB, PLAT_FILTERS, PRECISE_DAY, VERB } from "./constants.js";
import { fmtDay, storedChoice, todayISO } from "./util.js";

export const S = {
  api: null,
  me: null,
  profiles: [],
  games: [],
  entries: [],
  catalog: [],
  tab: storedChoice("sp-tab", ["feed", "shelf", "discover", "friends"], "feed"),
  scope: storedChoice("sp-scope", ["mine", "all"], "mine"),
  status: "all",
  search: "",
  sort: storedChoice("sp-sort", ["recent", "rated", "az"], "recent"),
  sheet: null, // the open sheet or page: { kind, ... }
  back: null, // where the back button goes from the open sheet/page
  draft: null,
  lastLoad: 0,
  seenAt: null, // S22: feed items newer than this are "new since you last opened"
  revealed: new Set(), // S24: spoiler reviews tapped open this session
  pending: {}, // S18: in-flight saves per game, so they never overlap
  cat: null, // S31: catalogue search state for the open Add/Link sheet
  similar: null, // S26: { key, games } IGDB games similar to ones you loved
  share: null, // S27: { gameId, include, url, blob, busy }
  disc: null, // S33/S34: { data: { trending, upcoming, has_history }, at, error }
  discView: storedChoice("sp-disc-view", ["trending", "calendar"], "trending"),
  plat: storedChoice(
    "sp-plat",
    PLAT_FILTERS.map((p) => p.id),
    "all",
  ),
  ext: {}, // full catalogue rows for games that aren't on the shelf (opened from Discover/picks)
  refreshed: new Set(), // catalogue rows already refreshed this session
  steamTried: new Set(), // S35: Steam lookups already done this session
  steamLoading: new Set(),
};
export let idx = { p: {}, g: {}, byGame: {}, c: {}, byIgdb: {} };

export function reindex() {
  idx = { p: {}, g: {}, byGame: {}, c: {}, byIgdb: {} };
  S.profiles.forEach((p) => (idx.p[p.id] = p));
  S.catalog.forEach((c) => (idx.c[c.igdb_id] = c));
  S.games.forEach((g) => {
    idx.g[g.id] = g;
    if (g.igdb_id != null) idx.byIgdb[g.igdb_id] = g;
  });
  S.entries.forEach((e) => (idx.byGame[e.game_id] = idx.byGame[e.game_id] || []).push(e));
}
export function myEntry(gameId) {
  return (idx.byGame[gameId] || []).find((e) => e.user_id === S.me) || null;
}
export function groupScore(gameId) {
  const rs = (idx.byGame[gameId] || []).map((e) => e.rating).filter((r) => r != null);
  if (!rs.length) return null;
  return { avg: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length };
}
export function lastActivity(gameId) {
  const g = idx.g[gameId];
  let t = g ? new Date(g.created_at).getTime() : 0;
  (idx.byGame[gameId] || []).forEach((e) => {
    t = Math.max(t, new Date(e.updated_at).getTime());
  });
  return t;
}
export function nameOf(id) {
  if (id === S.me) return "You";
  const p = idx.p[id];
  return p ? p.display_name : "Someone";
}
export function verbFor(e) {
  return e.user_id === S.me ? MY_VERB[e.status] : VERB[e.status];
}
// "You want to play, Maya finished": who in the group has this game, and how.
export function groupLine(gameId, max = 2) {
  const es = (idx.byGame[gameId] || [])
    .slice()
    .sort((a, b) => (a.user_id === S.me ? -1 : b.user_id === S.me ? 1 : b.updated_at.localeCompare(a.updated_at)));
  if (!es.length) return "";
  const bits = es.slice(0, max).map((e) => `${nameOf(e.user_id)} ${verbFor(e)}`);
  if (es.length > max) bits.push(`${es.length - max} more`);
  return bits.join(", ");
}
export function catOf(game) {
  return game && game.igdb_id != null ? idx.c[game.igdb_id] || null : null;
}
export function catRow(igdbId) {
  return idx.c[igdbId] || S.ext[igdbId] || null;
}
export function coverUrl(game, size) {
  if (game.cover_url && /^https:\/\//i.test(game.cover_url)) return game.cover_url;
  const c = catOf(game);
  return c && c.cover_image_id ? IGDB_IMG(c.cover_image_id, size) : "";
}

// When a game comes out: { upcoming, precise, date, short } from a catalogue row. Null if unknown.
export function releaseInfo(c) {
  if (!c) return null;
  const date = c.first_release_date || null,
    human = c.release_human || null;
  if (!date && !human) return null;
  if (date && date <= todayISO()) return { upcoming: false };
  const precise = !!date && (!human || PRECISE_DAY.test(human));
  return { upcoming: true, precise, date: precise ? date : null, short: precise ? fmtDay(date) : human || "TBA" };
}
