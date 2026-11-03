import { registerSheet, registerTab } from "./app/registry.js";
import { AVATAR, DAY_MS, ICON, IGDB_IMG, PLATFORMS, PLAT_FILTERS, PRECISE_DAY, SESSION_STEPS, STATUSES, STATUS_LABEL, VERB } from "./core/constants.js";
import { S, catOf, catRow, coverUrl, groupLine, groupScore, idx, lastActivity, myEntry, nameOf, reindex, releaseInfo, verbFor } from "./core/state.js";
import { $, addDays, ago, dateInput, daysUntil, debounce, esc, fmtDay, fmtHours, fmtNum, fmtRating, fromDateInput, lsGet, lsSet, norm, parseDay, round1, safeJson, since, todayISO, took } from "./core/util.js";
import { DemoApi, SupabaseApi } from "./data/api.js";
import { avatar, gameCover, markHTML, rowCover, spoilerText, star, stars, stickerFor, wearOf } from "./ui/cover.js";
import { busy, confirmDialog, toast } from "./ui/feedback.js";
import { emptyState, renderMain, root, safeRenderMain, topbar } from "./ui/screen.js";
import { closeSheet, goBack, openSheet, pageFrame, pageHead, refreshOpenSheet, renderSheet, rerenderKeepScroll, sheetFrame } from "./ui/sheet.js";
import { gameHueSat, gameTint, hsl, hueSat, tintFrom } from "./ui/theme.js";
import { applyUpdate, checkForUpdate, registerServiceWorker } from "./ui/update.js";

// ---------------- S26: taste match + picks ----------------
// Agreement between you and a friend over games you've both rated: 100% = identical ratings.
function taste(friendId) {
  if (!S.me || friendId === S.me) return null;
  const mine = {}, pairs = [];
  S.entries.forEach((e) => { if (e.user_id === S.me && e.rating != null) mine[e.game_id] = e.rating; });
  S.entries.forEach((e) => {
    if (e.user_id === friendId && e.rating != null && mine[e.game_id] != null) pairs.push({ gameId: e.game_id, me: mine[e.game_id], them: e.rating });
  });
  if (pairs.length < 2) return { n: pairs.length, pct: null, pairs };
  const diff = pairs.reduce((a, p) => a + Math.abs(p.me - p.them), 0) / pairs.length;
  return { n: pairs.length, pct: Math.round(100 * (1 - diff / 4.5)), pairs };
}

// Games on the shelf you haven't logged that friends rated highly, weighted by how much your tastes agree.
function friendPicks() {
  const logged = new Set(S.entries.filter((e) => e.user_id === S.me).map((e) => e.game_id));
  const tastes = {};
  S.profiles.forEach((p) => { if (p.id !== S.me) tastes[p.id] = taste(p.id); });
  const out = [];
  S.games.forEach((g) => {
    if (logged.has(g.id)) return;
    const rated = (idx.byGame[g.id] || []).filter((e) => e.user_id !== S.me && e.rating != null);
    if (!rated.length) return;
    let wsum = 0, sum = 0, best = null;
    rated.forEach((e) => {
      const t = tastes[e.user_id];
      const w = t && t.pct != null ? Math.max(0.15, t.pct / 100) : 0.6;
      wsum += w; sum += w * e.rating;
      const strength = e.rating * w;
      if (!best || strength > best.strength) best = { e, t, strength };
    });
    const score = sum / wsum;
    if (score < 3.5) return;
    const b = best.e, bt = best.t;
    const reason = `${nameOf(b.user_id)} rated it ${fmtRating(b.rating)}${bt && bt.pct != null && bt.pct >= 60 ? `, ${bt.pct}% match` : ""}`;
    out.push({ kind: "friend", game: g, score: score + rated.length * 0.05, reason });
  });
  return out.sort((a, b) => b.score - a.score);
}

// Liked games (yours, 3.5+) that are linked to the catalogue, and the IGDB "similar" ids they point to.
function similarSeeds() {
  const liked = S.entries.filter((e) => e.user_id === S.me && e.rating != null && e.rating >= 3.5)
    .map((e) => ({ e, g: idx.g[e.game_id] })).filter((x) => x.g && catOf(x.g))
    .sort((a, b) => b.e.rating - a.e.rating);
  const counts = new Map(), from = new Map();
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
async function loadSimilar() {
  if (!S.api || !S.api.catalogSimilar || similarLoading) return;
  const { ids } = similarSeeds();
  if (!ids.length) { S.similar = { key: "", games: [] }; return; }
  const key = ids.slice().sort((a, b) => a - b).join(",");
  if (S.similar && S.similar.key === key) return;
  const cached = safeJson(lsGet("sp-sim"));
  if (cached && cached.key === key && Date.now() - cached.at < DAY_MS) { S.similar = cached; if (S.tab === "feed") safeRenderMain(); return; }
  similarLoading = true;
  try {
    const games = await S.api.catalogSimilar(ids);
    S.similar = { key, games, at: Date.now() };
    lsSet("sp-sim", JSON.stringify(S.similar));
    if (S.tab === "feed") safeRenderMain();
  } catch (_) { /* picks are a nice-to-have; stay quiet */ }
  finally { similarLoading = false; }
}

function similarPicks() {
  if (!S.similar || !S.similar.games.length) return [];
  const { counts, from } = similarSeeds();
  return S.similar.games
    .filter((r) => !idx.byIgdb[r.igdb_id] && counts.has(r.igdb_id))
    .map((r) => {
      const titles = from.get(r.igdb_id) || [];
      return { kind: "similar", row: r, score: counts.get(r.igdb_id) + (r.critic_score || 70) / 100,
        reason: `Like ${titles.slice(0, 2).join(" and ")}` };
    })
    .sort((a, b) => b.score - a.score);
}

function picksFor() {
  const fp = friendPicks().slice(0, 6);
  const sp = similarPicks().slice(0, 10 - fp.length);
  return fp.concat(sp);
}

function pickReason(gameId) {
  const p = friendPicks().find((x) => x.game.id === gameId);
  return p ? p.reason : "";
}

// A light catalogue row we've seen somewhere (picks, Discover, search), for opening a game that isn't on the shelf.
function findRow(igdbId) {
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
  return c ? { igdb_id: c.igdb_id, name: c.name, cover_image_id: c.cover_image_id, platforms: c.platforms || [], year: c.first_release_date ? Number(c.first_release_date.slice(0, 4)) : null } : null;
}

// ---------------- Screens: boot / auth ----------------

function renderLoading() {
  root().innerHTML = `<div class="loading" role="status" aria-label="Loading">${markHTML()}</div>`;
}

function authShell(inner) {
  root().innerHTML = `<main class="auth">${markHTML()}${inner}</main>`;
}

function renderNotConfigured() {
  authShell(`<h1>Save Point</h1>
    <p class="lede">A shared game log for you and your friends: what everyone's playing, what they finished and what they thought.</p>
    <div class="notice">This copy isn't connected to a database yet. Add your Supabase details to <b>config.js</b> (the setup guide shows how), then reload.</div>
    <button class="btn block" data-act="start-demo">Try the demo</button>`);
}

function renderAuth(mode, message) {
  const signup = mode === "signup";
  const pending = safeJson(lsGet("sp-pending")) || {};
  authShell(`<h1>${signup ? "Join your crew" : "Save Point"}</h1>
    <p class="lede">${signup ? "Create an account with the invite code a friend gave you." : "Track and review games with your friends."}</p>
    ${message ? `<div class="notice" role="status">${message}</div>` : ""}
    <form data-form="${signup ? "signup" : "signin"}" novalidate>
      ${signup ? `<label class="field"><span>Your name</span><input class="input" name="name" autocomplete="nickname" maxlength="40" required value="${esc(pending.name || "")}"></label>` : ""}
      <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="off" required></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required>${signup ? "<small>At least 6 characters.</small>" : ""}</label>
      ${signup ? `<label class="field"><span>Invite code</span><input class="input" name="code" autocapitalize="off" autocomplete="off" required value="${esc(pending.code || "")}"></label>` : ""}
      <p class="error" role="alert"></p>
      <button class="btn block" type="submit">${signup ? "Create account" : "Sign in"}</button>
    </form>
    <p class="switch">${signup ? "Already have an account?" : "New here?"} <button data-act="auth-mode" data-mode="${signup ? "signin" : "signup"}">${signup ? "Sign in" : "Create an account"}</button></p>
    <div class="demo-cta">
      <button class="btn secondary block" data-act="try-demo">Try the demo</button>
      <p>Look around with sample games first. Nothing you do is saved to an account.</p>
    </div>`);
}

function renderJoin(message) {
  const pending = safeJson(lsGet("sp-pending")) || {};
  authShell(`<h1>One more step</h1>
    <p class="lede">Enter the invite code from your friends to join the group.</p>
    <form data-form="join" novalidate>
      <label class="field"><span>Your name</span><input class="input" name="name" autocomplete="nickname" maxlength="40" required value="${esc(pending.name || "")}"></label>
      <label class="field"><span>Invite code</span><input class="input" name="code" autocapitalize="off" autocomplete="off" required value="${esc(pending.code || "")}"></label>
      <p class="error" role="alert">${message ? esc(message) : ""}</p>
      <button class="btn block" type="submit">Join group</button>
    </form>
    <p class="switch"><button data-act="sign-out">Sign out</button></p>`);
}

async function afterSignIn() {
  renderLoading();
  try {
    const sess = await S.api.session();
    if (!sess) return renderAuth("signin");
    S.me = sess.userId;
    let member = await S.api.isMember();
    if (!member) {
      const pending = safeJson(lsGet("sp-pending"));
      if (pending && pending.code && pending.name) {
        try { await S.api.join(pending.code, pending.name); member = true; }
        catch (e) { return renderJoin(e.message); }
      }
    }
    if (!member) return renderJoin();
    lsSet("sp-pending", null);
    if (!S.seenAt) S.seenAt = lsGet("sp-seen") || new Date().toISOString();
    await reload();
    S.api.subscribe(debounce(() => reload(), 600));
  } catch (e) {
    renderError(e.message);
  }
}

function renderError(msg) {
  authShell(`<h1>Can't load</h1><div class="notice" role="alert">${esc(msg)}</div>
    <button class="btn block" data-act="retry">Try again</button>
    <p class="switch"><button data-act="sign-out">Sign out</button></p>`);
}

// ---------------- Data ----------------
async function reload() {
  const data = await S.api.loadAll();
  S.profiles = data.profiles; S.games = data.games; S.entries = data.entries; S.catalog = data.catalog || [];
  S.lastLoad = Date.now();
  reindex();
  renderMain();
  refreshOpenSheet();
  loadSimilar();
  maintainCatalog();
  if (S.tab === "discover") loadDiscover();
}

const STEAM_KEYS = ["steam_desc", "steam_pct", "steam_total", "steam_players", "steam_fetched_at"];
function mergeCatalog(rows) {
  (rows || []).forEach((r) => {
    if (!r || !r.igdb_id) return;
    const i = S.catalog.findIndex((x) => x.igdb_id === r.igdb_id);
    if (i < 0) { S.catalog.push(r); return; }
    const old = S.catalog[i], next = { ...old, ...r };
    // Never let an older copy wipe Steam numbers we fetched more recently.
    if (old.steam_fetched_at && (!r.steam_fetched_at || r.steam_fetched_at < old.steam_fetched_at)) STEAM_KEYS.forEach((k) => (next[k] = old[k]));
    S.catalog[i] = next;
  });
  reindex();
}

// Keeps catalogue rows fresh: wishlist games that aren't out yet (release dates move), and covers without a tint colour.
let maintaining = false;
async function maintainCatalog() {
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
  } catch (_) { /* try again next session */ }
  finally { maintaining = false; }
}

// S35: Steam review score + players online, looked up when a game page opens (the server caches it for a day).
async function ensureSteam(igdbId) {
  const c = catRow(igdbId);
  if (!c || !c.steam_appid || !S.api.catalogSteam || S.steamTried.has(igdbId)) return;
  if (c.steam_fetched_at && Date.now() - new Date(c.steam_fetched_at).getTime() < DAY_MS) return;
  S.steamTried.add(igdbId); S.steamLoading.add(igdbId);
  updatePageChips();
  try {
    const st = await S.api.catalogSteam(igdbId);
    const live = catRow(igdbId) || c; // the row may have been replaced by a refresh while we waited
    if (st) Object.assign(live, { steam_desc: st.desc, steam_pct: st.pct, steam_total: st.total, steam_players: st.players, steam_fetched_at: st.fetched_at || new Date().toISOString() });
  } catch (_) { /* the chip just doesn't show */ }
  S.steamLoading.delete(igdbId);
  updatePageChips();
}

// S33/S34: trending + upcoming releases (server caches 6 hours, we keep a copy for 3).
let discLoading = false;
async function loadDiscover(force) {
  if (!S.api || !S.api.catalogDiscover || discLoading) return;
  if (!S.disc) {
    const cached = safeJson(lsGet("sp-disc"));
    if (cached && cached.data && cached.demo === !!S.api.demo) S.disc = cached;
  }
  if (!force && S.disc && S.disc.data && Date.now() - S.disc.at < 3 * 3600e3) return;
  discLoading = true;
  if (S.disc && S.disc.error) { S.disc = null; if (S.tab === "discover") safeRenderMain(); }
  try {
    const data = await S.api.catalogDiscover();
    S.disc = { data, at: Date.now(), demo: !!S.api.demo };
    lsSet("sp-disc", JSON.stringify(S.disc));
  } catch (e) {
    if (!S.disc || !S.disc.data) S.disc = { data: null, at: 0, error: e.message };
  } finally {
    discLoading = false;
    if (S.tab === "discover") safeRenderMain();
  }
}

// ---------------- Main screens ----------------

function feedView() {
  const playing = S.entries
    .filter((e) => e.status === "playing" && idx.g[e.game_id])
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const items = S.entries
    .filter((e) => idx.g[e.game_id])
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 80);

  // Top: your current case, big, with +1 hour. If you're not playing anything, the most recent friend's.
  let top = "";
  const h = playing.find((e) => e.user_id === S.me) || playing[0];
  if (h) {
    const g = idx.g[h.game_id];
    const mineTop = h.user_id === S.me;
    const who = mineTop ? "You're playing" : `${nameOf(h.user_id)} is playing`;
    const sub = [h.started_at ? `started ${since(h.started_at)}` : "", mineTop && h.updated_at ? `last played ${ago(h.updated_at)}` : ""].filter(Boolean).join(", ");
    top = `<section class="now">
      <button class="now-case case-btn" data-act="open-game" data-id="${g.id}"${mineTop ? ' data-hold="1"' : ""} aria-label="${esc(who)} ${esc(g.title)}">${gameCover(g, { wear: wearOf(h.hours || 0) })}</button>
      <div class="now-text">
        <div class="now-who">${mineTop ? "" : avatar(h.user_id, "sm")}${esc(who)}</div>
        <button class="now-title link-btn" data-act="open-game" data-id="${g.id}">${esc(g.title)}</button>
        <div class="now-hours">${h.hours ? fmtHours(h.hours) : "0h"}</div>
        ${sub ? `<div class="now-sub">${esc(sub)}</div>` : ""}
        ${mineTop ? `<button class="btn now-add" data-act="quick-hours" data-id="${g.id}" data-delta="1">+1 hour</button>` : ""}
      </div>
    </section>`;
  }
  // Everyone else's current games, standing on a shelf.
  const rest = playing.filter((e) => e !== h).slice(0, 8);
  if (rest.length) {
    top += `<section class="section"><h2 class="section-title">On everyone's shelf now</h2>
      <div class="mini-shelf"><div class="mini-cases">${rest.map((e) => {
        const g2 = idx.g[e.game_id];
        return `<button class="mini" data-act="open-game" data-id="${g2.id}" aria-label="${esc(nameOf(e.user_id))} is playing ${esc(g2.title)}">
          <span class="mini-case">${gameCover(g2, { cls: "sm" })}${avatar(e.user_id, "sm mini-av")}</span>
          <span class="mini-name">${esc(e.user_id === S.me ? "You" : nameOf(e.user_id))}</span></button>`;
      }).join("")}</div><div class="ledge thin"></div></div></section>`;
  }

  const isNew = (e) => S.seenAt && e.user_id !== S.me && e.updated_at > S.seenAt;
  const newCount = items.filter(isNew).length;
  let rows = "";
  let dividerDone = false;
  items.forEach((e, i) => {
    if (newCount && !dividerDone && !isNew(e) && i > 0) {
      rows += `<li class="feed-divider" role="separator"><span>Earlier</span></li>`;
      dividerDone = true;
    }
    rows += feedItem(e, isNew(e));
  });
  const list = items.length
    ? `<section class="section"><h2 class="section-title">Latest${newCount ? ` <span class="new-count">${newCount} new</span>` : ""}</h2><ul class="feed">${rows}</ul></section>`
    : emptyState("Nothing logged yet", "Add a game you're playing and it'll show up here for everyone.", "Add a game");

  const picks = picksFor();
  const myRated = S.entries.filter((e) => e.user_id === S.me && e.rating != null).length;
  const picksHTML = picks.length
    ? `<section class="section"><h2 class="section-title">Picked for you</h2><div class="rail">${picks.map(pickCard).join("")}</div></section>`
    : S.entries.some((e) => e.user_id === S.me) && myRated < 2
      ? `<section class="section"><p class="nudge">Rate a couple of games and you'll get picks here, based on your friends' ratings and games like the ones you love.</p></section>` : "";

  return topbar("Feed") + top + picksHTML + list;
}

function pickCard(p) {
  if (p.kind === "friend") {
    return `<button class="rail-item" data-act="open-game" data-id="${p.game.id}" aria-label="${esc(p.game.title)}: ${esc(p.reason)}">
      ${gameCover(p.game, { sealed: true })}
      <div class="rail-title">${esc(p.game.title)}</div>
      <div class="rail-why">${esc(p.reason)}</div>
    </button>`;
  }
  const r = p.row;
  return `<button class="rail-item" data-act="open-row" data-igdb="${r.igdb_id}" data-why="${esc(p.reason)}" aria-label="${esc(r.name)}: ${esc(p.reason)}">
    ${rowCover(r, { sealed: true })}
    <div class="rail-title">${esc(r.name)}</div>
    <div class="rail-why">${esc(p.reason)}</div>
  </button>`;
}

function feedItem(e, fresh) {
  const g = idx.g[e.game_id];
  const t = e.status === "finished" ? took(e) : "";
  return `<li class="feed-item${fresh ? " is-new" : ""}">
    <button class="thumb" data-act="open-game" data-id="${g.id}" aria-label="Open ${esc(g.title)}">${gameCover(g, { cls: "sm", sealed: e.status === "want", sticker: e.status === "finished" ? `<span class="stk done">Completed</span>` : "" })}</button>
    <div>
      <div class="what"><b>${esc(nameOf(e.user_id))}</b> ${verbFor(e)} <button class="link-btn" data-act="open-game" data-id="${g.id}">${esc(g.title)}</button></div>
      <div class="when">${e.rating != null ? stars(e.rating, 12) + " " : ""}${ago(e.updated_at)}${e.hours ? ", " + fmtHours(e.hours) + " played" : ""}${t ? ", " + t : ""}</div>
      ${spoilerText(e, "quote")}
    </div>
  </li>`;
}

function shelfGames() {
  const mine = S.scope === "mine";
  let games = S.games.slice();
  const counts = { all: 0 };
  if (mine) {
    games = games.filter((g) => myEntry(g.id));
    counts.all = games.length;
    STATUSES.forEach((s) => (counts[s.id] = games.filter((g) => myEntry(g.id).status === s.id).length));
    if (S.status !== "all") games = games.filter((g) => myEntry(g.id).status === S.status);
  }
  const q = norm(S.search);
  if (q) games = games.filter((g) => norm(g.title + (g.platform || "")).includes(q));
  if (S.sort === "rated") {
    games.sort((a, b) => ((groupScore(b.id) || { avg: -1 }).avg - (groupScore(a.id) || { avg: -1 }).avg) || a.title.localeCompare(b.title));
  } else if (S.sort === "az") {
    games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  } else {
    games.sort((a, b) => lastActivity(b.id) - lastActivity(a.id));
  }
  return { games, counts, mine, q };
}

function shelfResults() {
  const { games, mine, q } = shelfGames();
  let grid;
  if (!S.games.length) grid = emptyState("The shelf is empty", "Add the first game you're playing or want to play.", "Add a game");
  else if (!games.length && q) grid = `<div class="empty"><h3>No games match "${esc(S.search)}"</h3><p>Check the spelling, or add it to the shelf.</p><button class="btn" data-act="add-game" data-title="${esc(S.search)}">Add ${esc(S.search)}</button></div>`;
  else if (!games.length && mine && S.status !== "all") grid = `<div class="empty"><h3>Nothing marked ${esc(STATUS_LABEL[S.status].toLowerCase())}</h3><p>Open a game and set its status to see it here.</p></div>`;
  else if (!games.length && mine) grid = emptyState("Your shelf is empty", "Log a game from Everyone's shelf, or add a new one.", "Add a game");
  else {
    const cols = window.innerWidth >= 560 ? 4 : 3;
    let rows = "";
    for (let i = 0; i < games.length; i += cols) {
      const row = games.slice(i, i + cols);
      rows += `<div class="shelf-row"><div class="cases">${row.map((g) => caseTile(g)).join("")}</div>
        <div class="ledge"><div class="labels">${row.map((g) => caseLabel(g, mine)).join("")}</div></div></div>`;
    }
    grid = `<div class="wall" style="--cols:${cols}">${rows}</div>`;
  }
  return `<div class="toolbar"><span class="subtle small">${games.length} ${games.length === 1 ? "game" : "games"}</span>
      <label><span class="sr-only">Sort by</span><select class="sort" name="sort">
        <option value="recent" ${S.sort === "recent" ? "selected" : ""}>Recently active</option>
        <option value="rated" ${S.sort === "rated" ? "selected" : ""}>Highest rated</option>
        <option value="az" ${S.sort === "az" ? "selected" : ""}>A to Z</option>
      </select></label>
    </div>${grid}`;
}

function shelfView() {
  const { counts, mine } = shelfGames();
  const chips = mine
    ? `<div class="chips" role="group" aria-label="Filter by status">
        ${[{ id: "all", label: "All" }, ...STATUSES].map((s) => `<button class="chip" data-act="status-filter" data-status="${s.id}" aria-pressed="${S.status === s.id}">${s.label}<b>${counts[s.id] || 0}</b></button>`).join("")}
      </div>`
    : "";
  const canHold = mine && S.entries.some((e) => e.user_id === S.me && e.status === "playing");
  return topbar("Shelf") + `
    ${canHold ? `<p class="hint">Hold a case to add an hour.</p>` : ""}
    <div class="seg" role="group" aria-label="Whose games">
      <button data-act="scope" data-scope="mine" aria-pressed="${mine}">My games</button>
      <button data-act="scope" data-scope="all" aria-pressed="${!mine}">Everyone's</button>
    </div>
    <label class="search"><span class="sr-only">Search games</span>${ICON.search}<input class="input" name="q" type="search" placeholder="Search games" value="${esc(S.search)}" autocomplete="off" enterkeyhint="search"></label>
    ${chips}
    <div id="shelf-results">${shelfResults()}</div>`;
}

// A case on the wall. Playing games stand forward; hold any logged case (not sealed) to add an hour.
function caseTile(g) {
  const me = myEntry(g.id);
  const out = me && me.status === "playing";
  const canHold = me && me.status !== "want";
  const label = [g.title, me && STATUS_LABEL[me.status], me && me.hours ? fmtHours(me.hours) : ""].filter(Boolean).join(", ");
  return `<button class="case-btn${out ? " out" : ""}" data-act="open-game" data-id="${g.id}"${canHold ? ' data-hold="1"' : ""} aria-label="${esc(label)}">
    ${gameCover(g, { sticker: stickerFor(g, me), sealed: !!me && me.status === "want", wear: me ? wearOf(me.hours || 0) : 0 })}</button>`;
}
// The shelf-edge label under each case: title, then hours and rating (mine) or the group's score (everyone's).
function caseLabel(g, mine) {
  const me = myEntry(g.id);
  let line;
  if (mine && me) {
    if (me.status === "want") { const rel = releaseInfo(catOf(g)); line = `<b>Sealed</b>${rel && rel.upcoming ? esc(rel.short) : ""}`; }
    else line = `<b>${me.hours ? fmtHours(me.hours) : "0h"}</b>${me.rating != null ? fmtRating(me.rating) + " stars" : esc(STATUS_LABEL[me.status])}`;
  } else {
    const sc = groupScore(g.id);
    const n = (idx.byGame[g.id] || []).length;
    line = sc ? `<b>${fmtRating(round1(sc.avg))}</b>${sc.n} rated` : `${n} logged`;
  }
  return `<div class="lbl"><span class="t">${esc(g.title)}</span>${line}</div>`;
}

// ---------------- Discover (S33 trending, S34 calendar) ----------------
function discoverView() {
  const seg = `<div class="seg" role="group" aria-label="Discover">
      <button data-act="disc-view" data-v="trending" aria-pressed="${S.discView === "trending"}">Trending</button>
      <button data-act="disc-view" data-v="calendar" aria-pressed="${S.discView === "calendar"}">Calendar</button>
    </div>`;
  const d = S.disc && S.disc.data;
  let body;
  if (!S.api.catalogDiscover) body = `<p class="nudge">Discover needs the games database, which this copy isn't connected to.</p>`;
  else if (S.discView === "calendar") body = calendarHTML(d);
  else if (d) body = trendingHTML(d);
  else if (S.disc && S.disc.error) body = discError();
  else body = skeleton();
  return topbar("Discover", false) + seg + body + `<p class="credit">Game data from IGDB. Player counts and review scores from Steam.</p>`;
}
function discError() {
  return `<div class="empty"><h3>Can't load Discover</h3><p>${esc(S.disc.error)}</p><button class="btn secondary" data-act="disc-retry">Try again</button></div>`;
}
function skeleton() {
  return `<div role="status" aria-label="Loading">${Array.from({ length: 6 }, () => `<div class="skel"><i></i><i></i><i></i></div>`).join("")}</div>`;
}
function wantButton(igdbId, name) {
  const shelf = idx.byIgdb[igdbId];
  const mine = shelf && myEntry(shelf.id);
  if (mine) return `<button class="want-btn" data-act="open-row" data-igdb="${igdbId}" aria-pressed="true" aria-label="${esc(name)} is on your shelf (${esc(STATUS_LABEL[mine.status])})">${ICON.check}</button>`;
  return `<button class="want-btn" data-act="quick-want" data-igdb="${igdbId}" aria-pressed="false" aria-label="Add ${esc(name)} to Want to play">${ICON.plus}</button>`;
}
function trendingHTML(d) {
  const items = d.trending || [];
  const note = "Steam's most played right now: new arrivals and fast climbers first. Tap + to put a sealed copy on your shelf.";
  if (!items.length) return `<p class="nudge">Nothing to show yet. Check back later.</p>`;
  return `<p class="disc-note">${note}</p><ol class="trend">${items.map((r, i) => {
    const shelf = idx.byIgdb[r.igdb_id];
    const line = shelf ? groupLine(shelf.id) : "";
    const meta = r.peak
      ? [`${fmtNum(r.peak)} peak players`, r.steam_pct != null ? `${r.steam_pct}% positive` : ""].filter(Boolean).join(", ")
      : [r.year, (r.platforms || []).slice(0, 3).join(", ")].filter(Boolean).join(", ");
    const hot = r.hot != null ? r.hot : /^\+/.test(r.reason || "");
    const reason = String(r.reason || "").replace(/^(New in Steam's top 100) this week$/, "$1");
    return `<li><span class="rank">${i + 1}</span>
      <button class="open" data-act="open-row" data-igdb="${r.igdb_id}">${rowCover(r, { sealed: !(shelf && myEntry(shelf.id)) })}<span class="t-text"><b>${esc(r.name)}</b>
        <span class="t-meta">${esc(meta)}</span><span class="reason${hot ? " hot" : ""}">${esc(reason)}</span>${line ? `<span class="t-status">${esc(line)}</span>` : ""}</span></button>
      ${wantButton(r.igdb_id, r.name)}</li>`;
  }).join("")}</ol>`;
}

function platKinds(list) {
  const k = new Set();
  (list || []).forEach((p) => {
    const s = String(p);
    if (/^(PC|Mac|Linux|Win)/i.test(s)) k.add("pc");
    else if (/^(PS|PlayStation)/i.test(s)) k.add("ps");
    else if (/(XSX|XONE|X360|Xbox|Series)/i.test(s)) k.add("xbox");
    else if (/(Switch|NSW|NS2)/i.test(s)) k.add("switch");
  });
  return k;
}

// Everything coming out: wishlist games on the shelf (yours and friends'), plus the big upcoming releases.
function calendarItems(d) {
  const map = new Map();
  S.games.forEach((g) => {
    const c = catOf(g);
    if (!c) return;
    const wants = (idx.byGame[g.id] || []).filter((e) => e.status === "want");
    if (!wants.length) return;
    const rel = releaseInfo(c);
    if (!rel || !rel.upcoming) return;
    map.set(c.igdb_id, {
      igdb_id: c.igdb_id, name: g.title, cover_image_id: c.cover_image_id, platforms: c.platforms || [],
      date: rel.date, human: rel.short, mine: wants.some((e) => e.user_id === S.me),
      wanters: wants.filter((e) => e.user_id !== S.me).map((e) => e.user_id),
    });
  });
  ((d && d.upcoming) || []).forEach((u) => {
    const precise = !!u.date && (!u.human || PRECISE_DAY.test(u.human));
    const ex = map.get(u.igdb_id);
    if (ex) { if (!ex.date && precise) { ex.date = u.date; ex.human = fmtDay(u.date); } return; }
    map.set(u.igdb_id, { ...u, date: precise ? u.date : null, human: precise ? fmtDay(u.date) : u.human || "TBA", mine: false, wanters: [], big: true });
  });
  const today = todayISO();
  return [...map.values()].filter((it) => !it.date || it.date >= today);
}

function calendarHTML(d) {
  const today = todayISO();
  const all = calendarItems(d);
  const listed = (it) => it.mine || it.wanters.length;
  const items = all.filter((it) => S.plat === "all" || listed(it) || platKinds(it.platforms).has(S.plat));
  const mine = all.filter((it) => it.mine);
  const nextMine = mine.filter((it) => it.date).sort((a, b) => a.date.localeCompare(b.date))[0];

  let summary;
  if (mine.length) {
    const n = daysUntil(nextMine ? nextMine.date : today);
    summary = `<b>${mine.length} ${mine.length === 1 ? "game" : "games"}</b> on your Want to play list ${mine.length === 1 ? "isn't" : "aren't"} out yet.` +
      (nextMine ? ` Next up: <b>${esc(nextMine.name)}</b>, ${esc(fmtDay(nextMine.date))} (${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}).` : "");
  } else {
    summary = "Games on your Want to play list show up here with their release dates. Tap + on anything coming up to add it.";
  }
  const filters = `<div class="chips" role="group" aria-label="Platform">${PLAT_FILTERS.map((p) =>
    `<button class="chip" data-act="plat" data-p="${p.id}" aria-pressed="${S.plat === p.id}">${p.label}</button>`).join("")}</div>`;

  const dated = items.filter((it) => it.date).sort((a, b) => a.date.localeCompare(b.date) || (listed(b) ? 1 : 0) - (listed(a) ? 1 : 0));
  const later = items.filter((it) => !it.date).sort((a, b) => (listed(b) ? 1 : 0) - (listed(a) ? 1 : 0) || String(a.human).localeCompare(String(b.human)));
  const weekEnd = addDays(today, 6);
  const groups = [];
  const push = (key, label, it) => { let gr = groups.find((x) => x.key === key); if (!gr) groups.push(gr = { key, label, items: [] }); gr.items.push(it); };
  dated.forEach((it) => {
    if (it.date <= weekEnd) return push("week", "This week", it);
    const dt = parseDay(it.date);
    const label = dt.toLocaleDateString(undefined, { month: "long", year: dt.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
    push(it.date.slice(0, 7), label, it);
  });
  if (later.length) groups.push({ key: "later", label: "Later, or no date yet", items: later });

  const loadingBig = !d && !(S.disc && S.disc.error);
  const body = groups.length
    ? groups.map((gr) => `<section class="cal-group"><h3>${esc(gr.label)}</h3><ul class="cal-list">${gr.items.map(calRow).join("")}</ul></section>`).join("")
    : loadingBig ? "" : `<p class="nudge">No releases match this filter.</p>`;
  return `<div class="cal-summary">${summary}</div>${filters}${body}${loadingBig ? skeleton() : ""}${S.disc && S.disc.error && !d ? discError() : ""}`;
}

function calRow(it) {
  const plats = (it.platforms || []).slice(0, 4).join(", ");
  let day;
  if (it.date) {
    const dt = parseDay(it.date);
    day = `<span class="day"><b>${dt.getDate()}</b><span>${esc(dt.toLocaleDateString(undefined, { weekday: "short" }))}</span></span>`;
  } else day = `<span class="day when">${esc(it.human || "TBA")}</span>`;
  let flag = "";
  if (it.mine) flag = `<span class="flag">On your list</span>`;
  else if (it.wanters.length) {
    const names = it.wanters.map(nameOf);
    flag = `<span class="flag friend">${esc(names.slice(0, 2).join(" and "))}${names.length > 2 ? " and others" : ""} ${names.length === 1 ? "wants" : "want"} it</span>`;
  }
  return `<li class="${it.mine ? "mine" : ""}">${day}
    <button class="open" data-act="open-row" data-igdb="${it.igdb_id}">${rowCover(it, { cls: "sm", sealed: true })}<span class="t-text"><b>${esc(it.name)}</b>
      ${plats ? `<span class="t-meta">${esc(plats)}</span>` : ""}${flag}</span></button>
    ${wantButton(it.igdb_id, it.name)}</li>`;
}

function friendStats(id) {
  const es = S.entries.filter((e) => e.user_id === id);
  const fin = es.filter((e) => e.status === "finished").length;
  const playing = es.filter((e) => e.status === "playing").length;
  const hours = es.reduce((a, e) => a + (e.hours || 0), 0);
  const rated = es.filter((e) => e.rating != null);
  const avg = rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : null;
  return { es, fin, playing, hours, avg, reviews: es.filter((e) => e.review).length };
}

function friendsView() {
  const people = S.profiles.slice().sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : friendStats(b.id).fin - friendStats(a.id).fin));
  const meP = idx.p[S.me] || { display_name: "", color: 3 };
  const list = people.map((p) => {
    const st = friendStats(p.id);
    const bits = [];
    if (st.playing) bits.push(`${st.playing} playing`);
    bits.push(`${st.es.length} logged`);
    if (st.hours) bits.push(`${Math.round(st.hours)}h played`);
    const t = taste(p.id);
    const match = t && t.pct != null ? `<span class="match">${t.pct}% match</span>` : "";
    const now = st.es.filter((e) => e.status === "playing" && idx.g[e.game_id]).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    const recent = st.es.filter((e) => idx.g[e.game_id]).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
    return `<button class="friend" data-act="open-friend" data-id="${p.id}">
      <span class="f-top">${avatar(p.id)}
        <span class="f-who"><span class="name">${esc(p.display_name)}${p.id === S.me ? ' <span class="subtle small">(you)</span>' : ""}</span>
          <span class="stats">${now ? `Playing ${esc(idx.g[now.game_id].title)}` : esc(bits.join(", "))}</span></span>${match}</span>
      ${recent.length ? `<span class="f-shelf"><span class="f-cases">${recent.map((e) => `<span class="f-case">${gameCover(idx.g[e.game_id], { cls: "sm", sealed: e.status === "want", sticker: e.status === "finished" ? `<span class="stk done">Completed</span>` : "" })}</span>`).join("")}</span><span class="ledge thin"></span></span>` : ""}
      <span class="f-stats"><span><b>${st.fin}</b>completed</span><span><b>${st.playing}</b>playing</span><span><b>${Math.round(st.hours)}h</b>played</span></span>
    </button>`;
  }).join("");

  const shareUrl = location.origin + location.pathname;
  return topbar("Friends", false) + `
    ${list}
    <section class="panel" aria-labelledby="you-h">
      <h2 class="section-title" id="you-h">Your profile</h2>
      <form data-form="profile">
        <label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="${esc(meP.display_name)}" autocomplete="nickname"></label>
        <div class="field"><span>Colour</span>
          <div class="swatches" role="group" aria-label="Profile colour">
            ${AVATAR.map((c, i) => `<button type="button" class="swatch" style="--c:${c}" data-act="color" data-color="${i}" aria-pressed="${meP.color === i}" aria-label="Colour ${i + 1}"></button>`).join("")}
          </div></div>
        <button class="btn secondary" type="submit">Save name</button>
      </form>
    </section>
    <section class="panel" aria-labelledby="inv-h">
      <h2 class="section-title" id="inv-h">Invite friends</h2>
      <p class="subtle" style="margin-top:0">Send them this link and your group's invite code. They create an account and they're in.</p>
      <div class="row" style="align-items:center"><input class="input" readonly value="${esc(shareUrl)}" aria-label="App link"><button class="btn secondary" style="flex:none" data-act="copy-link">Copy link</button></div>
    </section>
    <section class="panel">
      ${S.api.demo
        ? `<p class="subtle" style="margin-top:0">You're in demo mode.</p><div class="row"><button class="btn secondary" data-act="reset-demo">Reset demo data</button><button class="btn secondary" data-act="exit-demo">Exit demo</button></div>`
        : `<button class="btn secondary block" data-act="sign-out">Sign out</button>`}
    </section>`;
}

// ---------------- Sheets & pages ----------------
// push: remember the current sheet so Back returns to it (e.g. friend > game, game > share).
// Score chips on a game page: friends, critics, Steam, release date.
function scoreChips(c, sc) {
  const chip = (big, label) => `<div class="score-chip"><b>${esc(big)}</b><span>${esc(label)}</span></div>`;
  const out = [];
  if (sc) out.push(chip(fmtRating(round1(sc.avg)), sc.n === 1 ? "1 friend" : `${sc.n} friends`));
  if (c && c.critic_score != null) out.push(chip(String(Math.round(c.critic_score)), "Critics"));
  if (c && c.steam_pct != null && c.steam_total) out.push(chip(c.steam_pct + "%", "Steam" + (c.steam_desc ? ", " + c.steam_desc : "")));
  else if (c && S.steamLoading.has(c.igdb_id)) out.push(`<div class="score-chip pending" role="status"><b>…</b><span>Steam</span></div>`);
  const rel = releaseInfo(c);
  if (rel && rel.upcoming) out.push(chip(rel.short, rel.precise && daysUntil(rel.date) <= 60 ? `Out in ${daysUntil(rel.date)} ${daysUntil(rel.date) === 1 ? "day" : "days"}` : "Release"));
  let html = out.length ? `<div class="scores">${out.join("")}</div>` : "";
  if (c && c.steam_players > 0) html += `<p class="players">${fmtNum(c.steam_players)} playing on Steam right now</p>`;
  return html;
}
function updatePageChips() {
  const box = $("#chips");
  if (!box || !S.sheet) return;
  if (S.sheet.kind === "game") box.innerHTML = scoreChips(catOf(idx.g[S.sheet.id]), groupScore(S.sheet.id));
  else if (S.sheet.kind === "ext") box.innerHTML = scoreChips(catRow(S.sheet.igdb), null);
}
function aboutHTML(c) {
  if (!c) return "";
  return `<section class="about">
    ${c.genres && c.genres.length ? `<div class="genres">${c.genres.slice(0, 4).map((x) => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    ${c.summary ? `<p class="summary" id="summary">${esc(c.summary)}</p><button type="button" class="btn ghost more" data-act="more">More</button>` : ""}
    <p class="credit">Game data from IGDB${c.igdb_url ? `. <a href="${esc(c.igdb_url)}" target="_blank" rel="noopener">View on IGDB</a>` : ""}${c.steam_appid ? `. <a href="https://store.steampowered.com/app/${esc(c.steam_appid)}" target="_blank" rel="noopener">Steam page</a>` : ""}</p>
  </section>`;
}
function sessionsHTML(mine) {
  return `<div class="sessions"><span>Log a session</span>${SESSION_STEPS.map((h) =>
    `<button type="button" class="chip" data-act="quick-hours" data-id="${mine.game_id}" data-delta="${h}">+${h < 1 ? "30m" : h + "h"}</button>`).join("")}
    <span class="total">${mine.hours ? fmtHours(mine.hours) + " total" : ""}</span></div>`;
}

function gamePage(id) {
  const g = idx.g[id];
  if (!g) return "";
  const mine = myEntry(id);
  if (!S.draft || S.draft.gameId !== id) {
    S.draft = {
      gameId: id, status: mine ? mine.status : "playing", rating: mine ? mine.rating : null, hours: mine ? mine.hours : null,
      review: mine ? mine.review || "" : "", spoiler: mine ? !!mine.spoiler : false,
      started_at: mine ? mine.started_at || null : null, finished_at: mine ? mine.finished_at || null : null,
      prevStatus: mine ? mine.status : null,
    };
  }
  const d = S.draft;
  const c = catOf(g);
  const year = g.year || (c && c.first_release_date ? c.first_release_date.slice(0, 4) : "");
  const plats = g.platform || (c && c.platforms ? c.platforms.slice(0, 3).join(", ") : "");
  const meta = [year, c && c.genres && c.genres[0], plats].filter(Boolean).join(", ");
  const canShare = mine && (mine.rating != null || mine.review || mine.status === "finished");
  const head = pageHead({
    title: g.title, art: { url: coverUrl(g, "cover_big_2x"), tint: gameTint(g), title: g.title }, meta,
    chips: scoreChips(c, groupScore(id)),
    right: canShare ? `<button class="btn round glass" data-act="share-open" data-id="${id}" aria-label="Share my review">${ICON.share}</button>` : "",
  });
  const showDates = d.started_at || d.finished_at || (mine && mine.status !== "want");
  const body = `
    ${!mine && pickReason(id) ? `<p class="why">Picked for you: ${esc(pickReason(id))}</p>` : ""}
    <section class="card">
      <form data-form="entry" data-id="${id}">
        <div class="card-head"><h2>${mine ? "Your log" : "Log it"}</h2>${mine ? `<span class="subtle small">Updated ${esc(ago(mine.updated_at))}</span>` : ""}</div>
        <div class="status-pick" role="group" aria-label="Status">
          ${STATUSES.map((s) => `<button type="button" data-act="pick-status" data-status="${s.id}" aria-pressed="${d.status === s.id}">${s.label}</button>`).join("")}
        </div>
        ${mine && mine.status !== "want" ? `<div id="sessions">${sessionsHTML(mine)}</div>` : ""}
        <div class="field"><span>Your rating</span>
          <div class="star-input" role="group" aria-label="Rating">${starInput(d.rating)}
            ${d.rating != null ? `<button type="button" class="btn ghost clear" data-act="clear-rating">Clear</button>` : ""}</div>
          <div class="rating-readout">${d.rating != null ? `${fmtRating(d.rating)} out of 5` : "Tap a star. Tap its left half for a half star."}</div>
        </div>
        <label class="field"><span>Hours played</span><input class="input" name="hours" type="number" inputmode="decimal" min="0" step="0.5" value="${d.hours == null ? "" : d.hours}" placeholder="Optional"></label>
        <label class="field"><span>Review</span><textarea class="input" name="review" maxlength="5000" placeholder="What did you think? Optional.">${esc(d.review)}</textarea></label>
        <label class="check"><input type="checkbox" name="spoiler" ${d.spoiler ? "checked" : ""}> <span>Contains spoilers. Friends tap to read it.</span></label>
        ${showDates ? `<div class="row">
          <label class="field"><span>Started</span><input class="input" type="date" name="started_at" value="${dateInput(d.started_at)}"></label>
          <label class="field"><span>Finished</span><input class="input" type="date" name="finished_at" value="${dateInput(d.finished_at)}"></label>
        </div>` : ""}
        <p class="error" role="alert"></p>
        <button class="btn block" type="submit">${mine ? "Save changes" : "Add to my shelf"}</button>
      </form>
    </section>
    ${aboutHTML(c)}
    <section><h2 class="section-title">Friends</h2><div id="others">${othersReviews(id)}</div></section>
    <div class="page-actions">
      ${canShare ? `<button type="button" class="btn secondary block" data-act="share-open" data-id="${id}">Share my review as an image</button>` : ""}
      <div class="row">
        <button class="btn secondary" data-act="edit-game" data-id="${id}">Edit details</button>
        ${g.added_by === S.me ? `<button class="btn secondary" style="color:var(--danger)" data-act="delete-game" data-id="${id}">Delete game</button>` : ""}
      </div>
      ${mine ? `<button type="button" class="btn danger block" data-act="remove-entry" data-id="${mine.id}">Remove from my shelf</button>` : ""}
    </div>`;
  return pageFrame(g.title, head, body, { tint: gameTint(g), hs: gameHueSat(g) });
}

// A game from Discover or picks that isn't on the shelf yet.
function extPage(sh) {
  const id = sh.igdb;
  const full = catRow(id);
  const r = full || sh.row || { name: "Game" };
  const name = r.name || "Game";
  const img = r.cover_image_id;
  const year = full && full.first_release_date ? full.first_release_date.slice(0, 4) : r.year;
  const meta = [year, full && full.genres && full.genres[0], (r.platforms || []).slice(0, 3).join(", ")].filter(Boolean).join(", ");
  const tint = tintFrom(full && full.cover_color, id);
  const head = pageHead({
    title: name, meta,
    art: { url: img ? IGDB_IMG(img, "cover_big_2x") : "", tint, title: name },
    chips: full ? scoreChips(full, null) : r.critic_score != null ? scoreChips({ critic_score: r.critic_score }, null) : "",
  });
  const rel = releaseInfo(full);
  const upcoming = rel && rel.upcoming;
  const body = `
    ${sh.why ? `<p class="why">${esc(sh.why)}</p>` : ""}
    <section class="card">
      <div class="card-head"><h2>Add to your shelf</h2></div>
      <div class="ext-actions">
        <button class="btn block" data-act="ext-add" data-status="want">Want to play</button>
        ${upcoming ? "" : `<div class="row"><button class="btn secondary" data-act="ext-add" data-status="playing">Playing</button><button class="btn secondary" data-act="ext-add" data-status="finished">Finished</button></div>`}
        <button class="btn ghost" data-act="ext-more">Pick a platform first</button>
      </div>
      <p class="error" role="alert">${sh.error ? esc(sh.error) : ""}</p>
    </section>
    ${full ? aboutHTML(full) : sh.error ? "" : `<p class="subtle small" role="status">Loading details…</p>`}`;
  return pageFrame(name, head, body, { tint, hs: hueSat(full && full.cover_color, id) });
}
async function loadExt(sh) {
  const id = sh.igdb;
  if (idx.byIgdb[id]) return refreshOpenSheet();
  const have = catRow(id);
  if (have && have.summary !== undefined) { ensureSteam(id); return; }
  try {
    const row = await S.api.catalogGet(id);
    S.ext[id] = row;
    if (S.sheet === sh) rerenderKeepScroll();
    ensureSteam(id);
  } catch (e) {
    sh.error = e.message;
    if (S.sheet === sh) rerenderKeepScroll();
  }
}
function openRow(igdbId, why) {
  const g = idx.byIgdb[igdbId];
  S.draft = null;
  if (g) return openSheet({ kind: "game", id: g.id }, false);
  const row = findRow(igdbId);
  openSheet({ kind: "ext", igdb: igdbId, row, why: why || "" }, false);
}

// Put a catalogue game on the shelf (or reuse it if a friend already added it) and log a status.
async function addFromCatalog(igdbId, status, opts = {}) {
  const existing = idx.byIgdb[igdbId];
  if (existing) {
    if (!myEntry(existing.id) && status !== "none") await saveEntryOptimistic(existing.id, { status, rating: null, hours: null, review: null });
    return existing.id;
  }
  const full = (catRow(igdbId) && catRow(igdbId).summary !== undefined) ? catRow(igdbId) : await S.api.catalogGet(igdbId);
  const light = opts.light || findRow(igdbId) || {};
  const year = full.first_release_date ? Number(String(full.first_release_date).slice(0, 4)) : light.year || null;
  let g;
  try {
    g = await S.api.addGame({ title: full.name || light.name, platform: opts.platform || null, year, cover_url: null, igdb_id: igdbId });
  } catch (e) {
    if (/already on the shelf/i.test(e.message)) {
      await reload();
      const ex = idx.byIgdb[igdbId];
      if (ex) { if (!myEntry(ex.id) && status !== "none") await saveEntryOptimistic(ex.id, { status, rating: null, hours: null, review: null }); return ex.id; }
    }
    throw e;
  }
  if (status !== "none") await S.api.saveEntry(null, g.id, { status, rating: null, hours: null, review: null });
  await reload();
  return g.id;
}

function starInput(r) {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const fill = r == null ? 0 : r >= i ? 1 : r >= i - 0.5 ? 0.5 : 0;
    out += `<button type="button" class="star-btn" data-act="rate" data-n="${i}" aria-label="${i} star${i > 1 ? "s" : ""}">${star(fill)}</button>`;
  }
  return out;
}

function othersReviews(id) {
  const others = (idx.byGame[id] || []).filter((e) => e.user_id !== S.me)
    .sort((a, b) => (b.review ? 1 : 0) - (a.review ? 1 : 0) || b.updated_at.localeCompare(a.updated_at));
  if (!others.length) return `<p class="subtle" style="margin:0">None of your friends have logged this yet.</p>`;
  return others.map((e) => {
    const bits = [STATUS_LABEL[e.status].toLowerCase() + (e.status === "finished" && took(e) ? ` ${took(e)}` : "")];
    if (e.hours) bits.push(fmtHours(e.hours));
    bits.push(ago(e.updated_at));
    return `<article class="review">${avatar(e.user_id)}
      <div class="review-body"><span class="who">${esc(nameOf(e.user_id))}</span> <span class="meta">${esc(bits.join(", "))}</span>
        ${e.rating != null ? `<div>${stars(e.rating, 13)}</div>` : ""}
        ${spoilerText(e, "review-text")}
      </div></article>`;
  }).join("");
}

function addSheet(sh) {
  if (sh.mode !== "manual") return catalogSheet(sh);
  return sheetFrame("Add it by hand", `
    <button type="button" class="btn ghost backlink" data-act="cat-back">${ICON.back}<span>Back to search</span></button>
    <form data-form="add" novalidate>
      <label class="field"><span>Title</span><input class="input" name="title" maxlength="120" required autofocus autocomplete="off" value="${esc(sh.title || "")}"></label>
      <div id="dupe"></div>
      <div class="row">
        <label class="field"><span>Platform</span><input class="input" name="platform" list="platforms" maxlength="40" placeholder="Optional"></label>
        <label class="field" style="flex:0.6"><span>Year</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="2100" placeholder="Optional"></label>
      </div>
      <datalist id="platforms">${PLATFORMS.map((p) => `<option value="${p}">`).join("")}</datalist>
      <label class="field"><span>Cover image link</span><input class="input" name="cover_url" type="url" inputmode="url" autocapitalize="off" placeholder="https://… (optional)"><small>Paste a link to box art. Leave it blank and the game gets a plain tile with its name.</small></label>
      <div class="field"><span>Your status</span>
        <div class="status-pick" role="group" aria-label="Your status">
          ${[...STATUSES, { id: "none", label: "Just add it" }].map((s) => `<button type="button" data-act="pick-add-status" data-status="${s.id}" aria-pressed="${(sh.status || "playing") === s.id}">${s.label}</button>`).join("")}
        </div></div>
      <p class="error" role="alert"></p>
      <button class="btn block" type="submit">Add to shelf</button>
    </form>`);
}

// S31: search the games database (also used to link an existing game: sh.linkId)
function catalogSheet(sh) {
  const linking = !!sh.linkId;
  const st = S.cat || {};
  const picked = st.picked;
  let body;
  if (picked) {
    const onShelf = idx.byIgdb[picked.igdb_id];
    body = `<button type="button" class="btn ghost backlink" data-act="cat-unpick">${ICON.back}<span>Back to results</span></button>
      <div class="picked">
        ${rowCover(picked)}
        <div><h3>${esc(picked.name)}</h3><div class="subtle small">${[picked.year, (picked.platforms || []).slice(0, 5).join(", ")].filter(Boolean).map(esc).join("<br>")}</div></div>
      </div>
      ${onShelf && onShelf.id !== sh.linkId ? `<div class="suggest">${esc(onShelf.title)} is already on the shelf. <button type="button" data-act="open-game" data-id="${onShelf.id}">Open it</button></div>` : linking ? `
      <p class="subtle">Link <b>${esc(idx.g[sh.linkId] ? idx.g[sh.linkId].title : "this game")}</b> to this entry? It gets this cover art, genres, critic score and Steam reviews. Everyone's logs stay as they are.</p>
      <p class="error" role="alert"></p>
      <button class="btn block" data-act="cat-link">Link game</button>` : `
      ${(picked.platforms || []).length ? `<div class="field"><span>Which platform do you play on?</span>
        <div class="chips wrap" role="group" aria-label="Platform">${picked.platforms.slice(0, 10).map((pf) =>
          `<button type="button" class="chip" data-act="cat-platform" data-p="${esc(pf)}" aria-pressed="${st.platform === pf}">${esc(pf)}</button>`).join("")}</div></div>` : ""}
      <div class="field"><span>Your status</span>
        <div class="status-pick" role="group" aria-label="Your status">
          ${[...STATUSES, { id: "none", label: "Just add it" }].map((x) => `<button type="button" data-act="pick-add-status" data-status="${x.id}" aria-pressed="${(sh.status || "playing") === x.id}">${x.label}</button>`).join("")}
        </div></div>
      <p class="error" role="alert"></p>
      <button class="btn block" data-act="cat-add">Add to shelf</button>`}`;
  } else {
    body = `<label class="search"><span class="sr-only">Search the games database</span>${ICON.search}<input class="input" name="cat-q" type="search" placeholder="Search for a game" value="${esc(st.q || "")}" autofocus autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
      <div id="cat-results">${catalogResultsHTML(sh)}</div>
      ${linking ? "" : `<p class="manual"><button type="button" class="btn ghost" data-act="cat-manual">Can't find it? Add it by hand</button></p>`}
      <p class="credit">Game data from IGDB</p>`;
  }
  return sheetFrame(linking ? "Link to the games database" : "Add a game", body).replace('class="sheet"', 'class="sheet tall"');
}
function catalogResultsHTML(sh) {
  const st = S.cat || {};
  if (st.error) return `<div class="cat-msg" role="alert">${esc(st.error)}</div>`;
  if (st.loading && !(st.results || []).length) return `<div class="cat-msg" role="status">Searching…</div>`;
  if (!st.q || st.q.trim().length < 2) return `<div class="cat-msg">Type at least two letters of the title.</div>`;
  if (!(st.results || []).length) return `<div class="cat-msg">No matches for "${esc(st.q)}".</div>`;
  return `<ul class="cat-list${st.loading ? " is-loading" : ""}">${st.results.map((r) => {
    const onShelf = idx.byIgdb[r.igdb_id];
    return `<li><button type="button" data-act="cat-pick" data-igdb="${r.igdb_id}">
      ${rowCover(r, { size: "cover_small" })}
      <span class="cat-text"><b>${esc(r.name)}</b><span>${[r.year, (r.platforms || []).slice(0, 4).join(", ")].filter(Boolean).map(esc).join(" · ")}</span></span>
      ${onShelf && onShelf.id !== (sh && sh.linkId) ? `<span class="on-shelf">On the shelf</span>` : ""}
    </button></li>`;
  }).join("")}</ul>`;
}

// S21: the "Finished!" moment
// The finish moment: the disc drops back into its case, the case shuts, the Completed sticker slaps on.
function finishStage(g, play) {
  const url = coverUrl(g, "cover_big");
  const t = gameTint(g);
  const img = url ? `<img src="${esc(url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const name = `<span class="cv-t">${esc(g.title)}</span>`;
  return `<div class="finish-stage${play ? " play" : ""}" aria-hidden="true" style="--t:${t.tile};--tm:${t.soft}">
    <div class="fs-case">
      <div class="fs-tray"></div>
      <div class="disc fs-disc"><div class="label">${img || name}</div><span class="hub"></span></div>
      <div class="fs-lid"><div class="face back"></div><div class="face front"><div class="ins">${img || name}</div></div></div>
      <span class="stk done">Completed</span>
    </div>
  </div>`;
}
function finishSheet(id) {
  const g = idx.g[id];
  const mine = myEntry(id);
  if (!g || !mine) return "";
  if (!S.draft || S.draft.gameId !== id) S.draft = { gameId: id, rating: mine.rating, review: mine.review || "", spoiler: !!mine.spoiler };
  const d = S.draft;
  const t = took(mine);
  const play = S.sheet && !S.sheet.opened;
  if (S.sheet) S.sheet.opened = true;
  return sheetFrame("", `
    <div class="finish-hero${play ? " play" : ""}">${finishStage(g, play)}
      <h1>Back in its case.</h1>
      <p class="subtle">You finished ${esc(g.title)}${[t ? " " + t : "", mine.hours ? ", " + fmtHours(mine.hours) + " played" : ""].join("")}. How was it?</p>
    </div>
    <form data-form="finish" data-id="${id}" class="finish-form${play ? " play" : ""}">
      <div class="field"><span>Your rating</span>
        <div class="star-input" role="group" aria-label="Rating">${starInput(d.rating)}</div>
        <div class="rating-readout">${d.rating != null ? `${fmtRating(d.rating)} out of 5` : "Tap a star. Tap its left half for a half star."}</div>
      </div>
      <label class="field"><span>One line for your friends</span><input class="input" name="review" maxlength="280" value="${esc(d.review)}" placeholder="e.g. Best ending I've played in years"></label>
      <label class="check"><input type="checkbox" name="spoiler" ${d.spoiler ? "checked" : ""}> <span>Contains spoilers</span></label>
      <p class="error" role="alert"></p>
      <div class="row"><button type="button" class="btn secondary" data-act="open-game" data-id="${id}">Not now</button><button class="btn" type="submit">Save</button></div>
    </form>`, `You finished ${g.title}`);
}

function editSheet(id) {
  const g = idx.g[id];
  if (!g) return "";
  const c = catOf(g);
  const linkRow = S.api.catalogSearch ? `<div class="panel link-panel">
      ${c ? `<p style="margin:0 0 12px">Linked to <b>${esc(c.name)}</b> in the games database.</p>
        <div class="row"><button type="button" class="btn secondary" data-act="link-start" data-id="${id}">Change</button><button type="button" class="btn danger" data-act="unlink" data-id="${id}">Unlink</button></div>`
      : `<p style="margin:0 0 12px">Not linked to the games database yet. Link it to get cover art, genres, the critic score and Steam reviews.</p>
        <button type="button" class="btn secondary block" data-act="link-start" data-id="${id}">Link to the games database</button>`}
    </div>` : "";
  return sheetFrame("Edit game details", `${linkRow}
    <form data-form="edit" data-id="${id}" novalidate>
      <label class="field"><span>Title</span><input class="input" name="title" maxlength="120" required value="${esc(g.title)}"></label>
      <div class="row">
        <label class="field"><span>Platform</span><input class="input" name="platform" list="platforms" maxlength="40" value="${esc(g.platform || "")}"></label>
        <label class="field" style="flex:0.6"><span>Year</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="2100" value="${g.year || ""}"></label>
      </div>
      <datalist id="platforms">${PLATFORMS.map((p) => `<option value="${p}">`).join("")}</datalist>
      <label class="field"><span>Cover image link</span><input class="input" name="cover_url" type="url" inputmode="url" autocapitalize="off" value="${esc(g.cover_url || "")}" placeholder="https://…"></label>
      <p class="error" role="alert"></p>
      <div class="row"><button type="button" class="btn secondary" data-act="open-game" data-id="${id}">Cancel</button><button class="btn" type="submit">Save details</button></div>
    </form>`);
}

function friendSheet(id) {
  const p = idx.p[id];
  if (!p) return "";
  const st = friendStats(id);
  const groups = STATUSES.map((s) => {
    const es = st.es.filter((e) => e.status === s.id && idx.g[e.game_id]).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (!es.length) return "";
    return `<h2 class="section-title" style="margin-top:24px">${s.label} <span class="count">${es.length}</span></h2>
      <div class="grid">${es.map((e) => {
        const g = idx.g[e.game_id];
        return `<button class="tile" data-act="open-game" data-id="${g.id}">${gameCover(g)}
          <div class="tile-title">${esc(g.title)}</div>
          <div class="tile-meta">${e.rating != null ? stars(e.rating, 11) : e.hours ? fmtHours(e.hours) : ""}</div></button>`;
      }).join("")}</div>`;
  }).join("");
  const bits = [`${st.fin} finished`, `${st.es.length} logged`];
  if (st.hours) bits.push(`${Math.round(st.hours)} hours`);
  if (st.avg != null) bits.push(`average rating ${fmtRating(round1(st.avg))}`);
  const t = taste(id);
  let tasteHTML = "";
  if (t) {
    if (t.pct == null) {
      tasteHTML = `<div class="panel taste"><p class="subtle" style="margin:0">Rate ${2 - t.n} more ${2 - t.n === 1 ? "game" : "games"} you've both played to see your taste match.</p></div>`;
    } else {
      const loved = t.pairs.filter((x) => x.me >= 4 && x.them >= 4).map((x) => idx.g[x.gameId]).filter(Boolean);
      const split = t.pairs.slice().sort((a, b) => Math.abs(b.me - b.them) - Math.abs(a.me - a.them))[0];
      const splitGame = split && Math.abs(split.me - split.them) >= 1.5 ? idx.g[split.gameId] : null;
      tasteHTML = `<div class="panel taste">
        <div class="taste-top"><strong>${t.pct}%</strong><span>taste match, from ${t.n} games you've both rated</span></div>
        ${loved.length ? `<p><b>You both loved</b> ${loved.slice(0, 3).map((g) => esc(g.title)).join(", ")}</p>` : ""}
        ${splitGame ? `<p><b>You disagree on</b> ${esc(splitGame.title)} (you ${fmtRating(split.me)}, ${esc(p.display_name)} ${fmtRating(split.them)})</p>` : ""}
      </div>`;
    }
  }
  return sheetFrame("", `
    <div class="friend-head">${avatar(id, "lg")}
      <div><h1>${esc(p.display_name)}</h1>
      <div class="subtle small" style="margin-top:4px">${bits.join(", ")}</div></div></div>
    ${tasteHTML}
    ${groups || `<p class="subtle">${id === S.me ? "You haven't" : esc(p.display_name) + " hasn't"} logged any games yet.</p>`}`, p.display_name);
}

// ---------------- S27: share card ----------------
function shareSheet(id) {
  const g = idx.g[id];
  const mine = myEntry(id);
  if (!g || !mine || !S.share) return "";
  const sh = S.share;
  const canShare = !!(navigator.canShare && window.File);
  return sheetFrame("Share your review", `
    <div class="share-preview">${sh.url ? `<img src="${sh.url}" alt="Preview of your share image for ${esc(g.title)}">` : `<div class="share-wait" role="status">Making your image…</div>`}</div>
    ${mine.review ? `<label class="check"><input type="checkbox" name="share-include" ${sh.include ? "checked" : ""}> <span>Include my review${mine.spoiler ? " (it's marked as a spoiler)" : ""}</span></label>` : ""}
    <button class="btn block" data-act="share-go" ${sh.url ? "" : "disabled"}>${canShare ? "Share image" : "Save image"}</button>
    <p class="subtle small" style="text-align:center">${canShare ? "Send it to your group chat, or save it to Photos from the share menu." : "Saves a PNG you can post anywhere."}</p>`);
}

let shareSeq = 0;
async function buildShare() {
  const sh = S.share;
  if (!sh) return;
  const seq = ++shareSeq;
  sh.busy = true;
  try {
    const blob = await drawShareCard(sh.gameId, sh.include);
    if (seq !== shareSeq || S.share !== sh) return;
    if (sh.url) URL.revokeObjectURL(sh.url);
    sh.blob = blob; sh.url = URL.createObjectURL(blob); sh.busy = false;
    if (S.sheet && S.sheet.kind === "share") renderSheet();
  } catch {
    sh.busy = false;
    toast("Couldn't make the image. Try again.");
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    const done = (ok) => resolve(ok ? img : null);
    img.onload = () => done(true);
    img.onerror = () => done(false);
    setTimeout(() => done(false), 4000);
    img.src = src;
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = []; let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = words[i]; if (lines.length === maxLines) break; }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const usedAll = lines.join(" ").split(/\s+/).length >= words.length;
  if (!usedAll && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last.replace(/[\s,.;:]+$/, "") + "…";
  }
  return lines;
}
function starShape(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.46 : r;
    ctx.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
}

async function drawShareCard(gameId, includeReview) {
  const g = idx.g[gameId], e = myEntry(gameId), me = idx.p[S.me];
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const font = (w, px) => `${w} ${px}px "Funnel Display", system-ui, -apple-system, sans-serif`;
  try { await Promise.all([document.fonts.load(font(700, 72)), document.fonts.load(font(500, 34)), document.fonts.load(font(400, 36))]); } catch (_) {}
  const t = gameTint(g);

  // The wall, in this game's colours
  const [hh, hs] = gameHueSat(g);
  const C = { wall: hsl(hh, hs, 0.13), lip: hsl(hh, hs * 0.9, 0.22), front: hsl(hh, hs, 0.085), ink: hsl(hh, 0.5, 0.94), ink2: hsl(hh, 0.26, 0.79), body: hsl(hh, 0.32, 0.87), dim: hsl(hh, 0.16, 0.64) };
  ctx.fillStyle = C.wall; ctx.fillRect(0, 0, W, H);

  // The case, standing on a ledge
  const cw = 372, ch = 496, cx = (W - cw) / 2, cy = 96, ly = cy + ch;
  ctx.fillStyle = C.lip; ctx.fillRect(0, ly, W, 22);
  ctx.fillStyle = C.front; ctx.fillRect(0, ly + 22, W, 56);
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#141416"; rr(ctx, cx, cy, cw, ch, 18); ctx.fill(); ctx.restore();
  ctx.fillStyle = "#2E2F35"; rr(ctx, cx + 10, cy + 34, 9, ch - 68, 5); ctx.fill(); // hinge ridge
  const ax = cx + 32, ay = cy + 13, aw = cw - 45, ah = ch - 26;
  ctx.save(); rr(ctx, ax, ay, aw, ah, 6); ctx.clip();
  ctx.fillStyle = t.tile; ctx.fillRect(ax, ay, aw, ah);
  const art = await loadImage(coverUrl(g, "cover_big_2x"));
  let drewArt = false;
  if (art) {
    try {
      const sc = Math.max(aw / art.width, ah / art.height);
      const iw = art.width * sc, ih = art.height * sc;
      ctx.drawImage(art, ax + (aw - iw) / 2, ay + (ah - ih) / 2, iw, ih);
      drewArt = true;
    } catch (_) { drewArt = false; }
  }
  if (!drewArt) {
    ctx.fillStyle = t.soft; ctx.font = font(700, 44);
    const tl = wrapLines(ctx, g.title, aw - 56, 4);
    tl.forEach((s, i) => ctx.fillText(s, ax + 28, ay + ah - 36 - (tl.length - 1 - i) * 52));
  }
  const glare = ctx.createLinearGradient(ax, ay, ax + aw * 0.5, ay + ah * 0.35);
  glare.addColorStop(0, "rgba(255,255,255,0.18)"); glare.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = glare; ctx.fillRect(ax, ay, aw, ah);
  ctx.restore();
  // Sticker in the top-right corner
  const stick = e.status === "finished" ? "Completed" : e.status === "dropped" ? "Traded in" : e.status === "paused" ? "Paused" : "";
  if (stick === "Completed") {
    ctx.save(); ctx.translate(cx + cw - 22, cy + 26); ctx.rotate(0.21);
    ctx.fillStyle = "#F6D37A"; ctx.beginPath(); ctx.arc(0, 0, 82, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2A1418"; ctx.font = font(800, 27); ctx.textAlign = "center"; ctx.fillText("Completed", 0, 10);
    ctx.restore(); ctx.textAlign = "left";
  } else if (stick) {
    ctx.save(); ctx.translate(cx + cw - 30, cy + 20); ctx.rotate(stick === "Paused" ? -0.05 : -0.1);
    ctx.font = font(800, 30); const sw = ctx.measureText(stick).width + 40;
    ctx.fillStyle = C.ink; rr(ctx, -sw + 20, -26, sw, 54, 6); ctx.fill();
    ctx.fillStyle = C.wall; ctx.fillText(stick, -sw + 40, 10); ctx.restore();
  }

  // Text
  const x = 84;
  let y = ly + 150;
  const verb = VERB[e.status];
  ctx.fillStyle = C.ink2; ctx.font = font(500, 34);
  ctx.fillText(`${me ? me.display_name : "I"} ${verb}`, x, y);
  ctx.fillStyle = C.ink; ctx.font = font(800, 70);
  wrapLines(ctx, g.title, W - x * 2, 2).forEach((s) => { y += 80; ctx.fillText(s, x, y); });
  if (e.rating != null) {
    y += 34;
    for (let i = 0; i < 5; i++) {
      const sx = x + 28 + i * 68, sy = y + 28;
      ctx.fillStyle = "rgba(255,255,255,0.16)"; starShape(ctx, sx, sy, 28); ctx.fill();
      const fill = e.rating >= i + 1 ? 1 : e.rating >= i + 0.5 ? 0.5 : 0;
      if (fill) { ctx.save(); ctx.beginPath(); ctx.rect(sx - 29, sy - 29, 58 * fill, 58); ctx.clip(); ctx.fillStyle = "#F6D37A"; starShape(ctx, sx, sy, 28); ctx.fill(); ctx.restore(); }
    }
    y += 58;
  }
  const metaParts = [e.hours ? fmtHours(e.hours) + " played" : "", e.status === "finished" ? took(e) : ""].filter(Boolean);
  const bottomLimit = H - 130;
  if (e.review) {
    ctx.font = font(400, 36);
    if (includeReview) {
      ctx.fillStyle = C.body;
      const room = Math.max(1, Math.min(5, Math.floor((bottomLimit - y - 16) / 50)));
      wrapLines(ctx, "“" + e.review.replace(/\s+/g, " ").trim() + "”", W - x * 2, room).forEach((q) => { y += 50; ctx.fillText(q, x, y); });
    } else if (e.spoiler) {
      ctx.fillStyle = C.dim; y += 50; ctx.fillText("Review hidden: it has spoilers", x, y);
    }
  }
  // Footer
  const fy = H - 70;
  if (metaParts.length) { ctx.fillStyle = C.ink2; ctx.font = font(500, 28); ctx.fillText(metaParts.join(", ").replace(/^./, (c) => c.toUpperCase()), x, fy); }
  ctx.font = font(800, 32); ctx.fillStyle = C.ink;
  const brand = "Save Point"; const bw = ctx.measureText(brand).width;
  ctx.fillText(brand, W - x - bw, fy);
  const ix = W - x - bw - 44, iy = fy - 30;
  ctx.fillStyle = "#141416"; rr(ctx, ix, iy, 30, 38, 5); ctx.fill();
  ctx.fillStyle = C.ink; rr(ctx, ix + 7, iy + 3, 20, 32, 2); ctx.fill();
  ctx.fillStyle = "#F6D37A"; ctx.beginPath(); ctx.arc(ix + 27, iy + 5, 8, 0, Math.PI * 2); ctx.fill();
  if (drewArt) { ctx.fillStyle = C.dim; ctx.font = font(400, 20); ctx.fillText("Cover art via IGDB", x, H - 24); }

  return await new Promise((resolve, reject) => cv.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

// ---------------- Dialog & toast ----------------

// ---------------- Actions ----------------
const actions = {
  tab(el) {
    const t = el.dataset.tab;
    if (S.tab === t) { window.scrollTo({ top: 0, behavior: "smooth" }); reload().catch(() => {}); if (t === "discover") loadDiscover(true); return; }
    S.tab = t; lsSet("sp-tab", t); renderMain(); window.scrollTo(0, 0);
    if (t === "discover") loadDiscover();
  },
  scope(el) { S.scope = el.dataset.scope; lsSet("sp-scope", S.scope); renderMain(); },
  "status-filter"(el) { S.status = el.dataset.status; renderMain(); },
  "disc-view"(el) { S.discView = el.dataset.v; lsSet("sp-disc-view", S.discView); renderMain(); },
  "disc-retry"() { loadDiscover(true); },
  plat(el) { S.plat = el.dataset.p; lsSet("sp-plat", S.plat); renderMain(); },
  "open-game"(el) { S.draft = null; openSheet({ kind: "game", id: el.dataset.id }, !!(S.sheet && S.sheet.kind === "friend")); },
  "open-row"(el) { openRow(Number(el.dataset.igdb), el.dataset.why); },
  "open-friend"(el) { openSheet({ kind: "friend", id: el.dataset.id }); },
  async "quick-want"(el) {
    const id = Number(el.dataset.igdb);
    const row = findRow(id);
    el.disabled = true; el.setAttribute("aria-pressed", "true"); el.innerHTML = ICON.check;
    try {
      await addFromCatalog(id, "want", { light: row });
      toast(`${row ? row.name : "Game"} added to Want to play`);
      safeRenderMain();
    } catch (e) {
      if (el.isConnected) { el.disabled = false; el.setAttribute("aria-pressed", "false"); el.innerHTML = ICON.plus; }
      toast(e.message);
    }
  },
  async "ext-add"(el) {
    const sh = S.sheet;
    if (!sh || sh.kind !== "ext") return;
    const status = el.dataset.status;
    await busy(el, async () => {
      try {
        const gameId = await addFromCatalog(sh.igdb, status, { light: sh.row });
        S.draft = null;
        openSheet({ kind: "game", id: gameId }, false);
        toast(status === "want" ? "Added to Want to play" : "Added to your shelf");
        if (status === "finished") { S.draft = null; openSheet({ kind: "finish", id: gameId }, true); }
      } catch (e) {
        const err = $("#layer .error"); if (err) err.textContent = e.message; else toast(e.message);
      }
    });
  },
  "ext-more"() {
    const sh = S.sheet;
    const full = catRow(sh.igdb);
    const row = { ...(sh.row || {}), igdb_id: sh.igdb, name: (full && full.name) || (sh.row && sh.row.name), platforms: (full && full.platforms) || (sh.row && sh.row.platforms) || [], cover_image_id: (full && full.cover_image_id) || (sh.row && sh.row.cover_image_id) };
    S.cat = { q: row.name, results: [row], loading: false, error: null, picked: row, platform: null };
    openSheet({ kind: "add", mode: "search", status: "want" }, true);
  },
  "add-game"(el) {
    const title = el.dataset.title || "";
    S.cat = { q: title, results: [], loading: false, error: null, picked: null, platform: null };
    openSheet({ kind: "add", title, status: "playing", mode: S.api.catalogSearch ? "search" : "manual" });
    if (title) runCatalogSearch(title);
  },
  "cat-manual"() {
    const t = (S.cat && S.cat.q) || "";
    const back = S.back;
    openSheet({ ...S.sheet, mode: "manual", title: t }); S.back = back;
  },
  "cat-back"() { const back = S.back; openSheet({ ...S.sheet, mode: "search" }); S.back = back; },
  "cat-pick"(el) {
    const id = Number(el.dataset.igdb);
    const r = (S.cat.results || []).find((x) => x.igdb_id === id);
    if (!r) return;
    S.cat.picked = r; S.cat.platform = null;
    renderSheet();
  },
  "cat-unpick"() { S.cat.picked = null; renderSheet(); },
  "cat-platform"(el) {
    S.cat.platform = S.cat.platform === el.dataset.p ? null : el.dataset.p;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === S.cat.platform));
  },
  async "cat-add"(el) {
    const pk = S.cat.picked;
    const err = $(".sheet .error");
    await busy(el, async () => {
      try {
        const existing = idx.byIgdb[pk.igdb_id];
        if (existing) { S.draft = null; return openSheet({ kind: "game", id: existing.id }); }
        const gameId = await addFromCatalog(pk.igdb_id, S.sheet.status || "playing", { platform: S.cat.platform, light: pk });
        S.draft = null; S.cat = null;
        openSheet({ kind: "game", id: gameId });
        toast("Game added");
      } catch (e) {
        if (err && err.isConnected) err.textContent = e.message; else toast(e.message);
      }
    });
  },
  "link-start"(el) {
    S.cat = { q: idx.g[el.dataset.id] ? idx.g[el.dataset.id].title : "", results: [], loading: false, error: null, picked: null };
    openSheet({ kind: "add", mode: "search", linkId: el.dataset.id });
    if (S.cat.q) runCatalogSearch(S.cat.q);
  },
  async "cat-link"(el) {
    const gameId = S.sheet.linkId, pk = S.cat.picked;
    const err = $(".sheet .error");
    await busy(el, async () => {
      try {
        await S.api.catalogGet(pk.igdb_id);
        await S.api.linkGame(gameId, pk.igdb_id);
        await reload();
        S.cat = null; S.draft = null;
        openSheet({ kind: "game", id: gameId });
        toast("Game linked");
      } catch (e) {
        if (err && err.isConnected) err.textContent = e.message; else toast(e.message);
      }
    });
  },
  async unlink(el) {
    const ok = await confirmDialog({ title: "Unlink this game?", body: "It loses the cover art, genres, critic score and Steam reviews from the games database. Logs and reviews stay.", ok: "Unlink" });
    if (!ok) return;
    try { await S.api.linkGame(el.dataset.id, null); await reload(); renderSheet(); toast("Unlinked"); }
    catch (e) { toast(e.message); }
  },
  async "quick-hours"(el) { quickHours(el.dataset.id, Number(el.dataset.delta)); },
  reveal(el) {
    const e = S.entries.find((x) => x.id === el.dataset.id);
    if (!e) return;
    S.revealed.add(e.id);
    el.outerHTML = spoilerText(e, el.classList.contains("quote") ? "quote" : "review-text");
  },
  more(el) { const p = $("#summary"); if (p) { p.classList.toggle("open"); el.textContent = p.classList.contains("open") ? "Less" : "More"; } },
  "update-refresh"() { applyUpdate(); },
  "share-open"(el) {
    const id = el.dataset.id;
    const mine = myEntry(id);
    syncDraftFromForm();
    S.share = { gameId: id, include: !!(mine && mine.review && !mine.spoiler), url: null, blob: null, busy: true };
    openSheet({ kind: "share", id }, true);
    buildShare();
  },
  async "share-go"() {
    const sh = S.share;
    if (!sh || !sh.blob) return;
    const g = idx.g[sh.gameId];
    const name = `save-point-${norm(g ? g.title : "review") || "review"}.png`;
    const file = new File([sh.blob], name, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: g ? g.title : "Save Point" });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = sh.url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Image saved");
  },
  "edit-game"(el) { openSheet({ kind: "edit", id: el.dataset.id }, true); },
  close() { goBack(); },
  backdrop(el, ev) { if (ev.target === el) goBack(); },
  "pick-status"(el) {
    S.draft.status = el.dataset.status;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
  },
  "pick-add-status"(el) {
    S.sheet.status = el.dataset.status;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
  },
  rate(el, ev) {
    const n = Number(el.dataset.n);
    let val = n;
    if (ev.detail > 0) { // pointer click: left half = half star
      const r = el.getBoundingClientRect();
      if (ev.clientX - r.left < r.width / 2) val = n - 0.5;
    }
    syncDraftFromForm();
    S.draft.rating = val;
    rerenderKeepScroll();
  },
  "clear-rating"() { syncDraftFromForm(); S.draft.rating = null; rerenderKeepScroll(); },
  async "remove-entry"(el) {
    const ok = await confirmDialog({ title: "Remove from your shelf?", body: "Your status, rating, hours and review for this game will be deleted. The game stays on the group shelf.", ok: "Remove", danger: true });
    if (!ok) return;
    const id = el.dataset.id;
    const before = S.entries.slice();
    S.entries = S.entries.filter((x) => x.id !== id); S.draft = null; reindex(); renderMain(); renderSheet();
    toast("Removed from your shelf");
    try { await S.api.deleteEntry(id); syncSoon(); }
    catch (e) { S.entries = before; reindex(); renderMain(); renderSheet(); toast(e.message); }
  },
  async "delete-game"(el) {
    const id = el.dataset.id;
    const n = (idx.byGame[id] || []).filter((e) => e.user_id !== S.me).length;
    const ok = await confirmDialog({
      title: `Delete ${idx.g[id].title}?`,
      body: n ? `This removes it for everyone, including ${n} ${n === 1 ? "friend's log" : "friends' logs"} and reviews.` : "This removes it from the group shelf.",
      ok: "Delete game", danger: true,
    });
    if (!ok) return;
    try { await S.api.deleteGame(id); closeSheet(); await reload(); toast("Game deleted"); }
    catch (e) { toast(e.message); }
  },
  async color(el) {
    const c = Number(el.dataset.color);
    const p = idx.p[S.me]; const prev = p ? p.color : null;
    if (p) { p.color = c; renderMain(); }
    try { await S.api.updateProfile(S.me, { color: c }); toast("Colour saved"); }
    catch (e) { if (p) { p.color = prev; renderMain(); } toast(e.message); }
  },
  async "copy-link"() {
    try { await navigator.clipboard.writeText(location.origin + location.pathname); toast("Link copied"); }
    catch (_) { toast("Couldn't copy. Press and hold the link to copy it."); }
  },
  async "sign-out"() {
    try { await S.api.signOut(); } catch (_) {}
    S.me = null; closeSheet();
    renderAuth("signin");
  },
  "auth-mode"(el) { renderAuth(el.dataset.mode); },
  "start-demo"() { lsSet("sp-demo", "1"); start(); },
  // Demo from the sign-in screen: lives in the URL (?demo), so reopening the app lands on sign-in again (S1).
  "try-demo"() { history.replaceState(null, "", location.pathname + "?demo" + location.hash); start(); },
  "exit-demo"() { lsSet("sp-demo", null); closeSheet(); if (location.search.includes("demo")) history.replaceState(null, "", location.pathname + location.hash); start(); },
  async "reset-demo"() {
    const ok = await confirmDialog({ title: "Reset demo data?", body: "Your demo changes will be replaced with the sample games.", ok: "Reset" });
    if (!ok) return;
    S.api.reset(); await reload(); toast("Demo data reset");
  },
  retry() { afterSignIn(); },
};

function syncDraftFromForm() {
  const f = $('form[data-form="entry"], form[data-form="finish"]');
  if (!f || !S.draft) return;
  if (f.hours) { const h = f.hours.value.trim(); S.draft.hours = h === "" ? null : Number(h); }
  if (f.review) S.draft.review = f.review.value;
  if (f.spoiler) S.draft.spoiler = f.spoiler.checked;
  if (f.started_at) S.draft.started_at = fromDateInput(f.started_at.value);
  if (f.finished_at) S.draft.finished_at = fromDateInput(f.finished_at.value);
}

// ---------------- S18: instant saves ----------------
const syncSoon = debounce(() => reload().catch(() => {}), 1500);

function applyLocalEntry(gameId, fields) {
  const now = new Date().toISOString();
  let e = myEntry(gameId);
  const prev = e ? e.status : null;
  if (!e) {
    e = { id: "tmp-" + Math.random().toString(36).slice(2), game_id: gameId, user_id: S.me, rating: null, hours: null, review: null, spoiler: false, started_at: null, finished_at: null, created_at: now };
    S.entries.push(e);
  }
  Object.assign(e, fields, { updated_at: now });
  if (e.status === "playing" && !e.started_at && prev !== "playing") e.started_at = now;
  if (e.status === "finished" && !e.finished_at && prev !== "finished") e.finished_at = now;
  reindex();
  return e;
}

// Runs saves for one game one at a time, so a quick second save never races the first.
function queueFor(gameId, fn) {
  const prev = S.pending[gameId] || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  S.pending[gameId] = next;
  next.finally(() => { if (S.pending[gameId] === next) delete S.pending[gameId]; }).catch(() => {});
  return next;
}

async function saveEntryOptimistic(gameId, fields, okMsg) {
  const snapshot = JSON.stringify(S.entries);
  applyLocalEntry(gameId, fields);
  renderMain();
  try {
    await queueFor(gameId, async () => {
      const live = myEntry(gameId);
      const realId = live && !String(live.id).startsWith("tmp-") ? live.id : null;
      await S.api.saveEntry(realId, gameId, fields);
      if (!realId) await reload(); // swap the temporary entry for the real one
    });
    if (okMsg) toast(okMsg);
    syncSoon();
    return true;
  } catch (e) {
    S.entries = JSON.parse(snapshot); reindex(); renderMain();
    if (S.sheet) renderSheet();
    toast(e.message || "Couldn't save. Check your connection and try again.");
    return false;
  }
}

// S17: quick session buttons
// opts.undo: offer Undo in the toast. opts.undone: this call is the undo.
async function quickHours(gameId, delta, opts = {}) {
  const e = myEntry(gameId);
  if (!e || !delta) return;
  const before = e.hours;
  e.hours = Math.round(Math.min(99999, Math.max(0, (e.hours || 0) + delta)) * 10) / 10;
  e.updated_at = new Date().toISOString();
  reindex(); renderMain(); refreshOpenSheet();
  if (S.draft && S.draft.gameId === gameId) { S.draft.hours = e.hours; const f = $('form[data-form="entry"]'); if (f && f.hours) f.hours.value = e.hours; }
  const g = idx.g[gameId];
  if (opts.undone) toast(`Undone. ${fmtHours(e.hours) || "0h"} on ${g ? g.title : "this game"}`);
  else toast(`+${delta < 1 ? "30m" : delta + "h"} on ${g ? g.title : "this game"} (${fmtHours(e.hours)} total)`,
    opts.undo ? { label: "Undo", fn: () => quickHours(gameId, -delta, { undone: true }) } : undefined);
  try {
    await queueFor(gameId, async () => {
      const live = myEntry(gameId);
      if (String(live.id).startsWith("tmp-")) await reload();
      const real = myEntry(gameId);
      const total = await S.api.addHours(real.id, delta);
      real.hours = total;
    });
    syncSoon();
  } catch (err) {
    const cur = myEntry(gameId); if (cur) cur.hours = before;
    reindex(); renderMain(); refreshOpenSheet();
    toast(err.message);
  }
}

// S31: catalogue search (debounced, latest query wins)
let catTimer = null, catSeq = 0;
function runCatalogSearch(q) {
  if (!S.cat) return;
  S.cat.q = q; S.cat.error = null;
  clearTimeout(catTimer);
  const box = () => $("#cat-results");
  if (q.trim().length < 2) { S.cat.results = []; S.cat.loading = false; if (box()) box().innerHTML = catalogResultsHTML(S.sheet); return; }
  S.cat.loading = true; if (box()) box().innerHTML = catalogResultsHTML(S.sheet);
  catTimer = setTimeout(async () => {
    const mySeq = ++catSeq;
    try {
      const results = await S.api.catalogSearch(q);
      if (mySeq !== catSeq || !S.cat) return;
      S.cat.results = results; S.cat.loading = false;
    } catch (e) {
      if (mySeq !== catSeq || !S.cat) return;
      S.cat.results = []; S.cat.loading = false; S.cat.error = e.message;
    }
    if (box()) box().innerHTML = catalogResultsHTML(S.sheet);
  }, 350);
}

// ---------------- Forms ----------------
const forms = {
  async signin(f) {
    const email = f.email.value.trim(), password = f.password.value;
    if (!email || !password) throw new Error("Enter your email and password.");
    await S.api.signIn(email, password);
    await afterSignIn();
  },
  async signup(f) {
    const name = f.name.value.trim(), email = f.email.value.trim(), password = f.password.value, code = f.code.value.trim();
    if (!name || !email || !password || !code) throw new Error("Fill in all four fields.");
    if (password.length < 6) throw new Error("Use a password with at least 6 characters.");
    lsSet("sp-pending", JSON.stringify({ name, code }));
    const res = await S.api.signUp(email, password);
    if (res.needsConfirm) {
      return renderAuth("signin", `We sent a confirmation link to <b>${esc(email)}</b>. Open it, then come back here and sign in.`);
    }
    await afterSignIn();
  },
  async join(f) {
    const name = f.name.value.trim(), code = f.code.value.trim();
    if (!name || !code) throw new Error("Enter your name and the invite code.");
    await S.api.join(code, name);
    lsSet("sp-pending", null);
    await afterSignIn();
  },
  async entry() {
    syncDraftFromForm();
    const d = S.draft;
    if (d.hours != null && (!Number.isFinite(d.hours) || d.hours < 0)) throw new Error("Hours should be a number like 12 or 3.5.");
    if (d.started_at && d.finished_at && d.finished_at < d.started_at) throw new Error("The finish date is before the start date.");
    const mine = myEntry(d.gameId);
    const fields = {
      status: d.status,
      rating: d.rating,
      hours: d.hours == null ? null : Math.round(d.hours * 10) / 10,
      review: d.review.trim() || null,
      spoiler: !!d.spoiler && !!d.review.trim(),
    };
    if (mine || d.started_at) fields.started_at = d.started_at || null;
    if (mine || d.finished_at) fields.finished_at = d.finished_at || null;
    const justFinished = d.status === "finished" && d.prevStatus !== "finished";
    const gameId = d.gameId;
    S.draft = null;
    const ok = saveEntryOptimistic(gameId, fields, mine ? "Changes saved" : "Added to your shelf");
    if (justFinished && (fields.rating == null || !fields.review)) openSheet({ kind: "finish", id: gameId }, true);
    else rerenderKeepScroll();
    await ok;
  },
  async finish(f) {
    syncDraftFromForm();
    const d = S.draft, gameId = f.dataset.id;
    const review = (d.review || "").trim();
    S.draft = null;
    const saving = saveEntryOptimistic(gameId, { rating: d.rating, review: review || null, spoiler: !!d.spoiler && !!review }, "Saved. Nice work finishing it.");
    openSheet({ kind: "game", id: gameId });
    await saving;
  },
  async add(f) {
    const fields = gameFields(f);
    const dupe = S.games.find((g) => norm(g.title) === norm(fields.title));
    if (dupe) throw new Error(`${dupe.title} is already on the shelf. Open it from the suggestion above.`);
    const g = await S.api.addGame(fields);
    const st = S.sheet.status || "playing";
    if (st !== "none") await S.api.saveEntry(null, g.id, { status: st, rating: null, hours: null, review: null });
    await reload();
    S.draft = null; S.cat = null;
    openSheet({ kind: "game", id: g.id });
    toast("Game added");
  },
  async edit(f) {
    const id = f.dataset.id;
    const fields = gameFields(f);
    const dupe = S.games.find((g) => g.id !== id && norm(g.title) === norm(fields.title));
    if (dupe) throw new Error(`${dupe.title} is already on the shelf.`);
    await S.api.updateGame(id, fields);
    await reload();
    openSheet({ kind: "game", id });
    toast("Details saved");
  },
  async profile(f) {
    const name = f.name.value.trim();
    if (!name) throw new Error("Enter a name.");
    await S.api.updateProfile(S.me, { display_name: name });
    await reload();
    toast("Name saved");
  },
};

function gameFields(f) {
  const title = f.title.value.trim();
  if (!title) throw new Error("Enter the game's title.");
  const platform = f.platform.value.trim() || null;
  const yearRaw = f.year.value.trim();
  const year = yearRaw ? Number(yearRaw) : null;
  if (year != null && (!Number.isInteger(year) || year < 1950 || year > 2100)) throw new Error("Enter a year like 2024, or leave it blank.");
  const cover = f.cover_url.value.trim() || null;
  if (cover && !/^https:\/\//i.test(cover)) throw new Error("The cover link needs to start with https://");
  return { title, platform, year, cover_url: cover };
}

// ---------------- Wiring ----------------
document.addEventListener("click", (ev) => {
  if (suppressClick && ev.target.closest(".case-btn")) { suppressClick = false; ev.preventDefault(); return; }
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === "BUTTON" || el.dataset.act === "backdrop") {
    if (el.dataset.act !== "backdrop") ev.preventDefault();
    fn(el, ev);
  }
});

document.addEventListener("submit", async (ev) => {
  const f = ev.target.closest("form[data-form]");
  if (!f) return;
  ev.preventDefault();
  const fn = forms[f.dataset.form];
  if (!fn) return;
  const err = f.querySelector(".error");
  if (err) err.textContent = "";
  const btn = f.querySelector('button[type="submit"]');
  try { await busy(btn, () => fn(f, btn)); }
  catch (e) {
    const live = document.contains(err) ? err : null;
    if (live) live.textContent = e.message || String(e); else toast(e.message || String(e));
  }
});

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.name === "q") { S.search = t.value; const box = $("#shelf-results"); if (box) box.innerHTML = shelfResults(); return; }
  if (t.name === "cat-q") { runCatalogSearch(t.value); return; }
  if (t.form && t.form.dataset.form === "add" && t.name === "title") {
    const box = $("#dupe");
    const q = norm(t.value);
    const hit = q.length >= 2 && S.games.find((g) => norm(g.title) === q || (q.length >= 4 && norm(g.title).startsWith(q)));
    box.innerHTML = hit ? `<div class="suggest">${esc(hit.title)} is already on the shelf. <button type="button" data-act="open-game" data-id="${hit.id}">Open it</button></div>` : "";
  }
});
document.addEventListener("change", (ev) => {
  if (ev.target.name === "sort") { S.sort = ev.target.value; lsSet("sp-sort", S.sort); renderMain(); }
  if (ev.target.name === "share-include" && S.share) { S.share.include = ev.target.checked; buildShare(); }
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && S.sheet && !$(".dialog")) goBack();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { if (S.me) lsSet("sp-seen", new Date().toISOString()); return; }
  if (S.me && Date.now() - S.lastLoad > 20000) reload().catch(() => {});
  checkForUpdate();
});
window.addEventListener("pagehide", () => { if (S.me) lsSet("sp-seen", new Date().toISOString()); });

// ---------------- Hold a case on the Shelf to add an hour ----------------
let hold = null, suppressClick = false;
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

// ---------------- Start ----------------
async function start() {
  renderLoading();
  if (S.api && S.api.unsubscribe) S.api.unsubscribe();
  S.disc = null; S.ext = {}; S.similar = null; S.me = null;
  const params = new URLSearchParams(location.search);
  const cfg = window.SAVEPOINT_CONFIG || {};
  const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
  // S1: a working setup always opens the real app; demo only via ?demo, or the demo button when not set up.
  if (configured && !params.has("demo")) lsSet("sp-demo", null);
  if (params.has("demo") || (!configured && lsGet("sp-demo") === "1")) {
    S.api = new DemoApi();
    return afterSignIn();
  }
  if (!configured) return renderNotConfigured();
  S.api = new SupabaseApi(cfg.supabaseUrl.trim(), cfg.supabaseAnonKey.trim());
  S.api.onAuthChange((event) => {
    if (event === "SIGNED_OUT" && S.me) { S.me = null; closeSheet(); renderAuth("signin"); }
  });
  afterSignIn();
}

// ---------------- Register the features with the shell ----------------
registerTab({ id: "feed", label: "Feed", view: feedView });
registerTab({ id: "shelf", label: "Shelf", view: shelfView });
registerTab({ id: "discover", label: "Discover", view: discoverView });
registerTab({ id: "friends", label: "Friends", view: friendsView });

registerSheet("game", {
  render: (sh) => gamePage(sh.id),
  onOpen(sh) { const g = idx.g[sh.id]; if (g && g.igdb_id != null) ensureSteam(g.igdb_id); },
  refresh(sh) {
    if (!idx.g[sh.id]) return closeSheet();
    const box = $("#others"); if (box) box.innerHTML = othersReviews(sh.id);
    updatePageChips();
    const sess = $("#sessions"); const mine = myEntry(sh.id);
    if (sess && mine && mine.status !== "want") sess.innerHTML = sessionsHTML(mine);
  },
});
registerSheet("ext", {
  render: (sh) => extPage(sh),
  onOpen: (sh) => loadExt(sh),
  refresh(sh) { const g = idx.byIgdb[sh.igdb]; if (g) { S.draft = null; openSheet({ kind: "game", id: g.id }, false); } },
});
registerSheet("add", { render: (sh) => addSheet(sh) });
registerSheet("edit", { render: (sh) => editSheet(sh.id) });
registerSheet("friend", { render: (sh) => friendSheet(sh.id), refresh: () => renderSheet() });
registerSheet("finish", { render: (sh) => finishSheet(sh.id) });
registerSheet("share", { render: (sh) => shareSheet(sh.id) });

start();
registerServiceWorker();
