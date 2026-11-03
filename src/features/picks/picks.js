// S26: taste match between friends, friend picks and "Like X" picks from IGDB similar games.
import { DAY_MS } from "../../core/constants.js";
import { S, catOf, catRow, idx, nameOf } from "../../core/state.js";
import { fmtRating, lsGet, lsSet, safeJson } from "../../core/util.js";
import { safeRenderMain } from "../../ui/screen.js";

// Agreement between you and a friend over games you've both rated: 100% = identical ratings.
export function taste(friendId) {
  if (!S.me || friendId === S.me) return null;
  const mine = {},
    pairs = [];
  S.entries.forEach((e) => {
    if (e.user_id === S.me && e.rating != null) mine[e.game_id] = e.rating;
  });
  S.entries.forEach((e) => {
    if (e.user_id === friendId && e.rating != null && mine[e.game_id] != null)
      pairs.push({ gameId: e.game_id, me: mine[e.game_id], them: e.rating });
  });
  if (pairs.length < 2) return { n: pairs.length, pct: null, pairs };
  const diff = pairs.reduce((a, p) => a + Math.abs(p.me - p.them), 0) / pairs.length;
  return { n: pairs.length, pct: Math.round(100 * (1 - diff / 4.5)), pairs };
}

// Games on the shelf you haven't logged that friends rated highly, weighted by how much your tastes agree.
function friendPicks() {
  const logged = new Set(S.entries.filter((e) => e.user_id === S.me).map((e) => e.game_id));
  const tastes = {};
  S.profiles.forEach((p) => {
    if (p.id !== S.me) tastes[p.id] = taste(p.id);
  });
  const out = [];
  S.games.forEach((g) => {
    if (logged.has(g.id)) return;
    const rated = (idx.byGame[g.id] || []).filter((e) => e.user_id !== S.me && e.rating != null);
    if (!rated.length) return;
    let wsum = 0,
      sum = 0,
      best = null;
    rated.forEach((e) => {
      const t = tastes[e.user_id];
      const w = t && t.pct != null ? Math.max(0.15, t.pct / 100) : 0.6;
      wsum += w;
      sum += w * e.rating;
      const strength = e.rating * w;
      if (!best || strength > best.strength) best = { e, t, strength };
    });
    const score = sum / wsum;
    if (score < 3.5) return;
    const b = best.e,
      bt = best.t;
    const reason = `${nameOf(b.user_id)} rated it ${fmtRating(b.rating)}${bt && bt.pct != null && bt.pct >= 60 ? `, ${bt.pct}% match` : ""}`;
    out.push({ kind: "friend", game: g, score: score + rated.length * 0.05, reason });
  });
  return out.sort((a, b) => b.score - a.score);
}

// Liked games (yours, 3.5+) that are linked to the catalogue, and the IGDB "similar" ids they point to.
function similarSeeds() {
  const liked = S.entries
    .filter((e) => e.user_id === S.me && e.rating != null && e.rating >= 3.5)
    .map((e) => ({ e, g: idx.g[e.game_id] }))
    .filter((x) => x.g && catOf(x.g))
    .sort((a, b) => b.e.rating - a.e.rating);
  const counts = new Map(),
    from = new Map();
  liked.forEach(({ g }) => {
    (catOf(g).similar_ids || []).forEach((id) => {
      if (idx.byIgdb[id]) return; // already on the shelf
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!from.has(id)) from.set(id, []);
      from.get(id).push(g.title);
    });
  });
  const ids = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a - b).slice(0, 30);
  return { ids, counts, from };
}

let similarLoading = false;
export async function loadSimilar() {
  if (!S.api || !S.api.catalogSimilar || similarLoading) return;
  const { ids } = similarSeeds();
  if (!ids.length) {
    S.similar = { key: "", games: [] };
    return;
  }
  const key = ids
    .slice()
    .sort((a, b) => a - b)
    .join(",");
  if (S.similar && S.similar.key === key) return;
  const cached = safeJson(lsGet("sp-sim"));
  if (cached && cached.key === key && Date.now() - cached.at < DAY_MS) {
    S.similar = cached;
    if (S.tab === "feed") safeRenderMain();
    return;
  }
  similarLoading = true;
  try {
    const games = await S.api.catalogSimilar(ids);
    S.similar = { key, games, at: Date.now() };
    lsSet("sp-sim", JSON.stringify(S.similar));
    if (S.tab === "feed") safeRenderMain();
  } catch (_) {
    /* picks are a nice-to-have; stay quiet */
  } finally {
    similarLoading = false;
  }
}

function similarPicks() {
  if (!S.similar || !S.similar.games.length) return [];
  const { counts, from } = similarSeeds();
  return S.similar.games
    .filter((r) => !idx.byIgdb[r.igdb_id] && counts.has(r.igdb_id))
    .map((r) => {
      const titles = from.get(r.igdb_id) || [];
      return {
        kind: "similar",
        row: r,
        score: counts.get(r.igdb_id) + (r.critic_score || 70) / 100,
        reason: `Like ${titles.slice(0, 2).join(" and ")}`,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function picksFor() {
  const fp = friendPicks().slice(0, 6);
  const sp = similarPicks().slice(0, 10 - fp.length);
  return fp.concat(sp);
}

export function pickReason(gameId) {
  const p = friendPicks().find((x) => x.game.id === gameId);
  return p ? p.reason : "";
}

// A light catalogue row we've seen somewhere (picks, Discover, search), for opening a game that isn't on the shelf.
export function findRow(igdbId) {
  const pools = [
    S.similar && S.similar.games,
    S.disc && S.disc.data && S.disc.data.trending,
    S.disc && S.disc.data && S.disc.data.upcoming,
    S.cat && S.cat.results,
  ];
  for (const list of pools) {
    const r = (list || []).find((x) => x.igdb_id === igdbId);
    if (r) return r;
  }
  const c = catRow(igdbId);
  return c
    ? {
        igdb_id: c.igdb_id,
        name: c.name,
        cover_image_id: c.cover_image_id,
        platforms: c.platforms || [],
        year: c.first_release_date ? Number(c.first_release_date.slice(0, 4)) : null,
      }
    : null;
}
