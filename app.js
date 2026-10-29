(function () {
  "use strict";
  const { SupabaseApi, DemoApi } = window.SavePointApi;

  // ---------------- Constants ----------------
  const PLASTIC = [
    { c: "#E5483B", d: "#B3302A" }, // tomato
    { c: "#F2B63D", d: "#C58C1E" }, // mustard
    { c: "#1E9C8F", d: "#137366" }, // teal
    { c: "#3456D1", d: "#2238A0" }, // cobalt
    { c: "#7A4FC9", d: "#58349A" }, // grape
    { c: "#EE6FA3", d: "#C24D7F" }, // bubblegum
    { c: "#7E9A2F", d: "#5D7420" }, // olive
    { c: "#F07A2A", d: "#C25C17" }, // tangerine
  ];
  const INK = "#1C1F33";
  const STATUSES = [
    { id: "playing", label: "Playing" },
    { id: "want", label: "Want to play" },
    { id: "paused", label: "Paused" },
    { id: "finished", label: "Finished" },
    { id: "dropped", label: "Dropped" },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
  const VERB = { want: "wants to play", playing: "is playing", paused: "paused", finished: "finished", dropped: "dropped" };
  const PLATFORMS = ["PC", "PS5", "PS4", "Switch", "Switch 2", "Xbox Series", "Xbox One", "Steam Deck", "iPhone", "Android", "Quest", "Retro"];

  const STAR_PATH = "M12 2.6l2.83 6.07 6.65.73-4.95 4.52 1.36 6.55L12 17.2l-5.89 3.27 1.36-6.55-4.95-4.52 6.65-.73z";
  const ICON = {
    feed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>',
    shelf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3h14a1 1 0 0 1 1 1v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z"/><rect x="7.5" y="7" width="9" height="9" rx="1"/><path d="M9 4.5v1.5M12 4.5v1.5M15 4.5v1.5" stroke-linecap="round"/></svg>',
    friends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.9.8 3.1 2.6 3.5 5.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  };

  // ---------------- State ----------------
  const S = {
    api: null,
    me: null,
    profiles: [], games: [], entries: [],
    tab: lsGet("sp-tab") || "feed",
    scope: lsGet("sp-scope") || "mine",
    status: "all",
    search: "",
    sort: lsGet("sp-sort") || "recent",
    sheet: null, // { kind, ... }
    draft: null,
    lastLoad: 0,
  };
  let idx = { p: {}, g: {}, byGame: {} };

  // ---------------- Utils ----------------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  }
  function fmtHours(h) { return h == null ? "" : (Math.round(h * 10) / 10) + "h"; }
  function fmtRating(r) { return r == null ? "" : (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)); }
  const $ = (sel, root = document) => root.querySelector(sel);

  // ---------------- Derived data ----------------
  function reindex() {
    idx = { p: {}, g: {}, byGame: {} };
    S.profiles.forEach((p) => (idx.p[p.id] = p));
    S.games.forEach((g) => (idx.g[g.id] = g));
    S.entries.forEach((e) => (idx.byGame[e.game_id] = idx.byGame[e.game_id] || []).push(e));
  }
  function myEntry(gameId) { return (idx.byGame[gameId] || []).find((e) => e.user_id === S.me) || null; }
  function groupScore(gameId) {
    const rs = (idx.byGame[gameId] || []).map((e) => e.rating).filter((r) => r != null);
    if (!rs.length) return null;
    return { avg: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length };
  }
  function lastActivity(gameId) {
    const g = idx.g[gameId];
    let t = g ? new Date(g.created_at).getTime() : 0;
    (idx.byGame[gameId] || []).forEach((e) => { t = Math.max(t, new Date(e.updated_at).getTime()); });
    return t;
  }
  function nameOf(id) {
    if (id === S.me) return "You";
    const p = idx.p[id];
    return p ? p.display_name : "Someone";
  }

  // ---------------- Building blocks ----------------
  function starSvg(cls) { return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`; }
  function star(fill) {
    return `<span class="st">${starSvg("st-empty")}<span class="st-fill" style="width:${fill * 100}%">${starSvg("")}</span></span>`;
  }
  function stars(rating, size) {
    let out = "";
    for (let i = 1; i <= 5; i++) out += star(rating >= i ? 1 : rating >= i - 0.5 ? 0.5 : 0);
    return `<span class="stars" style="${size ? `--s:${size}px` : ""}" role="img" aria-label="${fmtRating(rating)} out of 5 stars">${out}</span>`;
  }
  function avatar(id, cls = "") {
    const p = idx.p[id];
    const col = PLASTIC[(p ? p.color : 3) % 8].c;
    const letter = p ? (p.display_name.trim()[0] || "?").toUpperCase() : "?";
    return `<span class="avatar ${cls}" style="--c:${col}" aria-hidden="true">${esc(letter)}</span>`;
  }
  function cart(game, opts = {}) {
    const key = game.id || game.title;
    const h = hash(String(key));
    const pl = PLASTIC[h % 8];
    const bandIdx = (h >>> 5) % 9;
    const band = bandIdx === 8 || bandIdx === h % 8 ? INK : PLASTIC[bandIdx].c;
    const t = game.title || "";
    const tk = t.length <= 6 ? 19 : t.length <= 10 ? 16 : t.length <= 16 ? 13.5 : t.length <= 26 ? 11.5 : 10;
    const meta = [game.platform, game.year].filter(Boolean).join(" ");
    const art = game.cover_url && /^https:\/\//i.test(game.cover_url);
    const sticker = opts.sticker ? `<span class="sticker">${esc(opts.sticker)}</span>` : "";
    return `<div class="cart${art ? " has-art" : ""}" style="--c:${pl.c};--c-dark:${pl.d};--band:${band};--tk:${tk}" aria-hidden="true">
      <div class="label">
        ${art ? `<img src="${esc(game.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.cart').classList.remove('has-art');this.remove()">` : ""}
        <div class="label-title">${esc(t)}</div>
        ${meta ? `<div class="label-meta">${esc(meta)}</div>` : ""}
      </div>${sticker}</div>`;
  }

  // ---------------- Screens: boot / auth ----------------
  const root = () => $("#app");
  const layer = () => $("#layer");

  function renderLoading() {
    root().innerHTML = `<div class="loading" role="status" aria-label="Loading">${cart({ id: "load", title: "Save Point" })}</div>`;
  }

  function authShell(inner) {
    root().innerHTML = `<main class="auth">
      <div class="auth-carts">${cart({ id: "a1", title: "Save" })}${cart({ id: "a7", title: "Point" })}${cart({ id: "a4", title: "Play" })}</div>
      ${inner}
    </main>`;
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
      <p class="switch">${signup ? "Already have an account?" : "New here?"} <button data-act="auth-mode" data-mode="${signup ? "signin" : "signup"}">${signup ? "Sign in" : "Create an account"}</button></p>`);
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

  function safeJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }

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
    S.profiles = data.profiles; S.games = data.games; S.entries = data.entries;
    S.lastLoad = Date.now();
    reindex();
    renderMain();
    refreshOpenSheet();
  }
  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ---------------- Main screens ----------------
  function renderMain() {
    const keepScroll = window.scrollY;
    const tabs = [
      { id: "feed", label: "Feed" },
      { id: "shelf", label: "Shelf" },
      { id: "friends", label: "Friends" },
    ];
    const body = S.tab === "shelf" ? shelfView() : S.tab === "friends" ? friendsView() : feedView();
    root().innerHTML = `
      <main class="screen" id="main">
        ${S.api.demo ? `<div class="demo-bar"><span>Demo mode: changes stay on this device.</span><button data-act="exit-demo">Exit demo</button></div>` : ""}
        ${body}
      </main>
      <nav class="tabbar" aria-label="Sections"><div class="tabbar-inner">
        ${tabs.map((t) => `<button data-act="tab" data-tab="${t.id}" ${S.tab === t.id ? 'aria-current="page"' : ""}>${ICON[t.id]}<span>${t.label}</span></button>`).join("")}
      </div></nav>`;
    window.scrollTo(0, keepScroll);
  }

  function topbar(title) {
    return `<header class="topbar"><h1 class="big-title">${esc(title)}</h1>
      <button class="btn round" data-act="add-game" aria-label="Add a game">${ICON.plus}</button></header>`;
  }

  function feedView() {
    const playing = S.entries
      .filter((e) => e.status === "playing" && idx.g[e.game_id])
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 12);
    const items = S.entries
      .filter((e) => idx.g[e.game_id])
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 80);

    const strip = playing.length
      ? `<h2 class="section-title">Playing right now</h2>
         <div class="now-playing">${playing.map((e) => `
           <button class="np" data-act="open-game" data-id="${e.game_id}" aria-label="${esc(nameOf(e.user_id))} is playing ${esc(idx.g[e.game_id].title)}">
             ${cart(idx.g[e.game_id])}
             <div class="np-who">${avatar(e.user_id, "sm")}<span>${esc(nameOf(e.user_id))}</span></div>
           </button>`).join("")}</div>`
      : "";

    const list = items.length
      ? `<h2 class="section-title">Latest</h2><ul class="feed">${items.map(feedItem).join("")}</ul>`
      : emptyState("Nothing logged yet", "Add a game you're playing and it'll show up here for everyone.", "Add a game");

    return topbar("Feed") + strip + list;
  }

  function feedItem(e) {
    const g = idx.g[e.game_id];
    const who = nameOf(e.user_id);
    const verb = e.user_id === S.me ? { want: "want to play", playing: "are playing" }[e.status] || VERB[e.status] : VERB[e.status];
    return `<li class="feed-item">
      ${avatar(e.user_id)}
      <div>
        <div class="what"><b>${esc(who)}</b> ${verb} <button class="link-btn" data-act="open-game" data-id="${g.id}">${esc(g.title)}</button></div>
        <div class="when">${e.rating != null ? stars(e.rating, 13) + " " : ""}${ago(e.updated_at)}${e.hours ? ", " + fmtHours(e.hours) + " played" : ""}</div>
        ${e.review ? `<div class="quote">${esc(e.review)}</div>` : ""}
      </div>
      <button class="thumb" data-act="open-game" data-id="${g.id}" aria-label="Open ${esc(g.title)}">${cart(g)}</button>
    </li>`;
  }

  function emptyState(title, body, cta) {
    return `<div class="empty">${cart({ id: "empty", title: "?" })}<h3>${esc(title)}</h3><p>${esc(body)}</p>
      ${cta ? `<button class="btn" data-act="add-game">${esc(cta)}</button>` : ""}</div>`;
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
    else grid = `<div class="grid">${games.map((g) => shelfTile(g, mine)).join("")}</div>`;
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
    return topbar("Shelf") + `
      <div class="seg" role="group" aria-label="Whose games">
        <button data-act="scope" data-scope="mine" aria-pressed="${mine}">My games</button>
        <button data-act="scope" data-scope="all" aria-pressed="${!mine}">Everyone's</button>
      </div>
      <label class="search"><span class="sr-only">Search games</span>${ICON.search}<input class="input" name="q" type="search" placeholder="Search games" value="${esc(S.search)}" autocomplete="off" enterkeyhint="search"></label>
      ${chips}
      <div id="shelf-results">${shelfResults()}</div>`;
  }

  function shelfTile(g, mine) {
    const me = myEntry(g.id);
    const sc = groupScore(g.id);
    const sticker = me ? STATUS_LABEL[me.status] : "";
    const meta = sc
      ? `${stars(sc.avg, 12)}<span>${fmtRating(Math.round(sc.avg * 10) / 10)}</span>`
      : `<span>${(idx.byGame[g.id] || []).length ? "No ratings yet" : "Nobody's logged it"}</span>`;
    return `<button class="tile" data-act="open-game" data-id="${g.id}">
      ${cart(g, { sticker: mine && S.status !== "all" ? "" : sticker })}
      <div class="tile-title">${esc(g.title)}</div>
      <div class="tile-meta">${meta}</div>
    </button>`;
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
      return `<button class="friend" data-act="open-friend" data-id="${p.id}">
        ${avatar(p.id)}
        <div><div class="name">${esc(p.display_name)}${p.id === S.me ? ' <span class="subtle small">(you)</span>' : ""}</div>
          <div class="stats">${bits.join(", ")}</div></div>
        <div class="big"><strong>${st.fin}</strong><span>finished</span></div>
      </button>`;
    }).join("");

    const shareUrl = location.origin + location.pathname;
    return `<header class="topbar"><h1 class="big-title">Friends</h1></header>
      ${list}
      <section class="panel" aria-labelledby="you-h">
        <h2 class="section-title" id="you-h">Your profile</h2>
        <form data-form="profile">
          <label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="${esc(meP.display_name)}" autocomplete="nickname"></label>
          <div class="field"><span>Colour</span>
            <div class="swatches" role="group" aria-label="Profile colour">
              ${PLASTIC.map((pc, i) => `<button type="button" class="swatch" style="--c:${pc.c}" data-act="color" data-color="${i}" aria-pressed="${meP.color === i}" aria-label="Colour ${i + 1}"></button>`).join("")}
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

  // ---------------- Sheets ----------------
  function openSheet(sheet) {
    S.sheet = sheet;
    renderSheet();
  }
  function closeSheet() {
    S.sheet = null; S.draft = null;
    layer().innerHTML = "";
    document.body.style.overflow = "";
  }
  function refreshOpenSheet() {
    if (!S.sheet) return;
    if (S.sheet.kind === "game") {
      if (!idx.g[S.sheet.id]) return closeSheet();
      const box = $("#others"); if (box) box.innerHTML = othersReviews(S.sheet.id);
      const sc = $("#score"); if (sc) sc.outerHTML = scoreHTML(S.sheet.id);
    } else if (S.sheet.kind === "friend") {
      renderSheet();
    }
  }
  function sheetFrame(title, inner, label) {
    return `<div class="backdrop" data-act="backdrop">
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label || title)}">
        <div class="grabber"></div>
        <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn round secondary" data-act="close" aria-label="Close">${ICON.close}</button></div>
        ${inner}
      </div></div>`;
  }
  function renderSheet() {
    const sh = S.sheet;
    if (!sh) return;
    let html = "";
    if (sh.kind === "game") html = gameSheet(sh.id);
    else if (sh.kind === "add") html = addSheet(sh);
    else if (sh.kind === "edit") html = editSheet(sh.id);
    else if (sh.kind === "friend") html = friendSheet(sh.id);
    layer().innerHTML = html;
    document.body.style.overflow = "hidden";
    const first = $(".sheet [autofocus]");
    if (first && !matchMedia("(pointer: coarse)").matches) first.focus();
  }

  function scoreHTML(id) {
    const sc = groupScore(id);
    return `<div class="score" id="score">${sc
      ? `<strong>${fmtRating(Math.round(sc.avg * 10) / 10)}</strong>${stars(sc.avg, 16)}<span>from ${sc.n} ${sc.n === 1 ? "rating" : "ratings"}</span>`
      : `<span>No ratings yet</span>`}</div>`;
  }

  function gameSheet(id) {
    const g = idx.g[id];
    if (!g) return "";
    const mine = myEntry(id);
    if (!S.draft || S.draft.gameId !== id) {
      S.draft = { gameId: id, status: mine ? mine.status : "playing", rating: mine ? mine.rating : null, hours: mine ? mine.hours : null, review: mine ? mine.review || "" : "" };
    }
    const d = S.draft;
    const facts = [g.platform, g.year].filter(Boolean).join(", ");
    return sheetFrame("", `
      <div class="game-hero">${cart(g)}<div>
        <h1>${esc(g.title)}</h1>
        <div class="facts">${esc(facts)}${facts ? "<br>" : ""}Added by ${esc(nameOf(g.added_by))}</div>
        ${scoreHTML(id)}
      </div></div>

      <form data-form="entry" data-id="${id}">
        <h2 class="section-title">${mine ? "Your log" : "Log it"}</h2>
        <div class="status-pick" role="group" aria-label="Status">
          ${STATUSES.map((s) => `<button type="button" data-act="pick-status" data-status="${s.id}" aria-pressed="${d.status === s.id}">${s.label}</button>`).join("")}
        </div>
        <div class="field"><span>Your rating</span>
          <div class="star-input" role="group" aria-label="Rating">${starInput(d.rating)}
            ${d.rating != null ? `<button type="button" class="btn ghost clear" data-act="clear-rating">Clear</button>` : ""}</div>
          <div class="rating-readout">${d.rating != null ? `${fmtRating(d.rating)} out of 5` : "Tap a star. Tap its left half for a half star."}</div>
        </div>
        <label class="field"><span>Hours played</span><input class="input" name="hours" type="number" inputmode="decimal" min="0" step="0.5" value="${d.hours == null ? "" : d.hours}" placeholder="Optional"></label>
        <label class="field"><span>Review</span><textarea class="input" name="review" maxlength="5000" placeholder="What did you think? Optional.">${esc(d.review)}</textarea></label>
        <p class="error" role="alert"></p>
        <button class="btn block" type="submit">${mine ? "Save changes" : "Add to my shelf"}</button>
        ${mine ? `<button type="button" class="btn danger block" data-act="remove-entry" data-id="${mine.id}">Remove from my shelf</button>` : ""}
      </form>

      <h2 class="section-title" style="margin-top:30px">Friends</h2>
      <div id="others">${othersReviews(id)}</div>

      <div class="row" style="margin-top:22px">
        <button class="btn secondary" data-act="edit-game" data-id="${id}">Edit game details</button>
        ${g.added_by === S.me ? `<button class="btn danger" data-act="delete-game" data-id="${id}">Delete game</button>` : ""}
      </div>`, g.title);
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
    if (!others.length) return `<p class="subtle">None of your friends have logged this yet.</p>`;
    return others.map((e) => `<article class="review">
      <div class="review-head">${avatar(e.user_id)}<div>
        <div class="who">${esc(nameOf(e.user_id))}</div>
        <div class="meta">${STATUS_LABEL[e.status]}${e.hours ? `, ${fmtHours(e.hours)}` : ""}, ${ago(e.updated_at)}</div>
      </div></div>
      ${e.rating != null ? `<div style="margin-top:8px">${stars(e.rating, 16)}</div>` : ""}
      ${e.review ? `<p>${esc(e.review)}</p>` : ""}
    </article>`).join("");
  }

  function addSheet(sh) {
    return sheetFrame("Add a game", `
      <form data-form="add" novalidate>
        <label class="field"><span>Title</span><input class="input" name="title" maxlength="120" required autofocus autocomplete="off" value="${esc(sh.title || "")}"></label>
        <div id="dupe"></div>
        <div class="row">
          <label class="field"><span>Platform</span><input class="input" name="platform" list="platforms" maxlength="40" placeholder="Optional"></label>
          <label class="field" style="flex:0.6"><span>Year</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="2100" placeholder="Optional"></label>
        </div>
        <datalist id="platforms">${PLATFORMS.map((p) => `<option value="${p}">`).join("")}</datalist>
        <label class="field"><span>Cover image link</span><input class="input" name="cover_url" type="url" inputmode="url" autocapitalize="off" placeholder="https://… (optional)"><small>Paste a link to box art. Leave it blank and the game gets a cartridge.</small></label>
        <div class="field"><span>Your status</span>
          <div class="status-pick" role="group" aria-label="Your status">
            ${[...STATUSES, { id: "none", label: "Just add it" }].map((s) => `<button type="button" data-act="pick-add-status" data-status="${s.id}" aria-pressed="${(sh.status || "playing") === s.id}">${s.label}</button>`).join("")}
          </div></div>
        <p class="error" role="alert"></p>
        <button class="btn block" type="submit">Add to shelf</button>
      </form>`);
  }

  function editSheet(id) {
    const g = idx.g[id];
    if (!g) return "";
    return sheetFrame("Edit game details", `
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
      return `<h2 class="section-title" style="margin-top:22px">${s.label} <span class="subtle small">${es.length}</span></h2>
        <div class="grid">${es.map((e) => {
          const g = idx.g[e.game_id];
          return `<button class="tile" data-act="open-game" data-id="${g.id}">${cart(g)}
            <div class="tile-title">${esc(g.title)}</div>
            <div class="tile-meta">${e.rating != null ? stars(e.rating, 12) : e.hours ? fmtHours(e.hours) : ""}</div></button>`;
        }).join("")}</div>`;
    }).join("");
    const bits = [`${st.fin} finished`, `${st.es.length} logged`];
    if (st.hours) bits.push(`${Math.round(st.hours)} hours`);
    if (st.avg != null) bits.push(`average rating ${fmtRating(Math.round(st.avg * 10) / 10)}`);
    return sheetFrame("", `
      <div style="display:flex;gap:14px;align-items:center;margin:4px 0 6px">${avatar(id, "lg")}
        <div><h1 class="big-title" style="font-size:32px">${esc(p.display_name)}</h1>
        <div class="subtle small" style="margin-top:4px">${bits.join(", ")}</div></div></div>
      ${groups || `<p class="subtle">${id === S.me ? "You haven't" : esc(p.display_name) + " hasn't"} logged any games yet.</p>`}`, p.display_name);
  }

  // ---------------- Dialog & toast ----------------
  function confirmDialog({ title, body, ok, danger }) {
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "backdrop";
      el.style.alignItems = "center";
      el.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
        <h2 id="dlg-t">${esc(title)}</h2><p>${esc(body)}</p>
        <div class="row"><button class="btn secondary" data-r="0">Cancel</button><button class="btn" data-r="1" style="${danger ? "background:var(--danger);color:#fff" : ""}">${esc(ok)}</button></div></div>`;
      document.body.appendChild(el);
      el.querySelector('[data-r="1"]').focus();
      el.addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-r]");
        if (b || ev.target === el) { el.remove(); resolve(!!(b && b.dataset.r === "1")); }
      });
    });
  }
  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2200);
  }

  async function busy(btn, fn) {
    if (btn) { btn.disabled = true; }
    try { return await fn(); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }

  // ---------------- Actions ----------------
  const actions = {
    tab(el) {
      const t = el.dataset.tab;
      if (S.tab === t) { window.scrollTo({ top: 0, behavior: "smooth" }); reload().catch(() => {}); return; }
      S.tab = t; lsSet("sp-tab", t); renderMain(); window.scrollTo(0, 0);
    },
    scope(el) { S.scope = el.dataset.scope; lsSet("sp-scope", S.scope); renderMain(); },
    "status-filter"(el) { S.status = el.dataset.status; renderMain(); },
    "open-game"(el) { S.draft = null; openSheet({ kind: "game", id: el.dataset.id }); },
    "open-friend"(el) { openSheet({ kind: "friend", id: el.dataset.id }); },
    "add-game"(el) { openSheet({ kind: "add", title: el.dataset.title || "", status: "playing" }); },
    "edit-game"(el) { openSheet({ kind: "edit", id: el.dataset.id }); },
    close() { closeSheet(); },
    backdrop(el, ev) { if (ev.target === el) closeSheet(); },
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
      S.draft.rating = val;
      syncDraftFromForm();
      rerenderEntryForm();
    },
    "clear-rating"() { syncDraftFromForm(); S.draft.rating = null; rerenderEntryForm(); },
    async "remove-entry"(el) {
      const ok = await confirmDialog({ title: "Remove from your shelf?", body: "Your status, rating, hours and review for this game will be deleted. The game stays on the group shelf.", ok: "Remove", danger: true });
      if (!ok) return;
      try { await S.api.deleteEntry(el.dataset.id); S.draft = null; await reload(); renderSheet(); toast("Removed from your shelf"); }
      catch (e) { toast(e.message); }
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
      try { await S.api.updateProfile(S.me, { color: c }); await reload(); toast("Colour saved"); }
      catch (e) { toast(e.message); }
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
    "exit-demo"() { lsSet("sp-demo", null); closeSheet(); if (location.search.includes("demo")) history.replaceState(null, "", location.pathname); start(); },
    async "reset-demo"() {
      const ok = await confirmDialog({ title: "Reset demo data?", body: "Your demo changes will be replaced with the sample games.", ok: "Reset" });
      if (!ok) return;
      S.api.reset(); await reload(); toast("Demo data reset");
    },
    retry() { afterSignIn(); },
  };

  function syncDraftFromForm() {
    const f = $('form[data-form="entry"]');
    if (!f || !S.draft) return;
    const h = f.hours.value.trim();
    S.draft.hours = h === "" ? null : Number(h);
    S.draft.review = f.review.value;
  }
  function rerenderEntryForm() {
    const sheet = $(".sheet");
    const top = sheet ? sheet.scrollTop : 0;
    renderSheet();
    const s2 = $(".sheet"); if (s2) s2.scrollTop = top;
  }

  // ---------------- Forms ----------------
  const forms = {
    async signin(f, btn) {
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
    async entry(f) {
      syncDraftFromForm();
      const d = S.draft;
      if (d.hours != null && (!isFinite(d.hours) || d.hours < 0)) throw new Error("Hours should be a number like 12 or 3.5.");
      const mine = myEntry(d.gameId);
      await S.api.saveEntry(mine ? mine.id : null, d.gameId, {
        status: d.status,
        rating: d.rating,
        hours: d.hours == null ? null : Math.round(d.hours * 10) / 10,
        review: d.review.trim() || null,
      });
      S.draft = null;
      await reload();
      renderSheet();
      toast(mine ? "Changes saved" : "Added to your shelf");
    },
    async add(f) {
      const fields = gameFields(f);
      const dupe = S.games.find((g) => norm(g.title) === norm(fields.title));
      if (dupe) throw new Error(`${dupe.title} is already on the shelf. Open it from the suggestion above.`);
      const g = await S.api.addGame(fields);
      const st = S.sheet.status || "playing";
      if (st !== "none") await S.api.saveEntry(null, g.id, { status: st, rating: null, hours: null, review: null });
      await reload();
      S.draft = null;
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
    if (t.form && t.form.dataset.form === "add" && t.name === "title") {
      const box = $("#dupe");
      const q = norm(t.value);
      const hit = q.length >= 2 && S.games.find((g) => norm(g.title) === q || (q.length >= 4 && norm(g.title).startsWith(q)));
      box.innerHTML = hit ? `<div class="suggest">${esc(hit.title)} is already on the shelf. <button type="button" data-act="open-game" data-id="${hit.id}">Open it</button></div>` : "";
    }
  });
  document.addEventListener("change", (ev) => {
    if (ev.target.name === "sort") { S.sort = ev.target.value; lsSet("sp-sort", S.sort); renderMain(); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && S.sheet && !$(".dialog")) closeSheet();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.me && Date.now() - S.lastLoad > 20000) reload().catch(() => {});
  });

  // ---------------- Start ----------------
  async function start() {
    renderLoading();
    if (S.api && S.api.unsubscribe) S.api.unsubscribe();
    const params = new URLSearchParams(location.search);
    if (params.has("demo")) lsSet("sp-demo", "1");
    const cfg = window.SAVEPOINT_CONFIG || {};
    const configured = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase;
    if (lsGet("sp-demo") === "1") {
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

  start();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
