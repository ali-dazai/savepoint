// Data layer. Two backends with the same shape:
//  - SupabaseApi: the real shared database
//  - DemoApi: sample data kept in this browser, for trying the app
(function () {
  "use strict";

  function errMsg(e) {
    if (!e) return "Something went wrong.";
    const m = e.message || String(e);
    if (/Invalid login credentials/i.test(m)) return "That email and password don't match.";
    if (/User already registered/i.test(m)) return "There's already an account with that email. Sign in instead.";
    if (/Password should be/i.test(m)) return "Use a password with at least 6 characters.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Can't reach the server. Check your connection and try again.";
    if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you, then sign in.";
    if (/games_igdb_id_key/i.test(m)) return "That game is already on the shelf.";
    return m;
  }

  const CATALOG_ERRORS = {
    sign_in_required: "Sign in again to search the games database.",
    not_a_member: "Join the group to search the games database.",
    igdb_busy: "The games database is busy. Try again in a moment.",
    not_found: "That game isn't in the games database any more.",
  };
  function catalogError(code) {
    return new Error(CATALOG_ERRORS[code] || "Can't reach the games database right now. You can still add the game by hand.");
  }

  const CATALOG_COLS = "igdb_id, name, cover_image_id, cover_color, first_release_date, release_human, hypes, platforms, genres, summary, critic_score, critic_count, igdb_url, steam_appid, similar_ids, steam_desc, steam_pct, steam_total, steam_players, steam_fetched_at, fetched_at";
  function cleanCatalog(x) {
    return { ...x, critic_score: x.critic_score == null ? null : Number(x.critic_score) };
  }

  // ---------------- Supabase ----------------
  class SupabaseApi {
    constructor(url, key) {
      this.sb = window.supabase.createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      this.demo = false;
      this.channel = null;
    }
    async session() {
      const { data } = await this.sb.auth.getSession();
      return data.session ? { userId: data.session.user.id, email: data.session.user.email } : null;
    }
    onAuthChange(fn) {
      this.sb.auth.onAuthStateChange((event) => fn(event));
    }
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(errMsg(error));
    }
    async signUp(email, password) {
      const { data, error } = await this.sb.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.origin + location.pathname },
      });
      if (error) throw new Error(errMsg(error));
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("There's already an account with that email. Sign in instead.");
      }
      return { needsConfirm: !data.session };
    }
    async signOut() {
      this.unsubscribe();
      await this.sb.auth.signOut();
    }
    async isMember() {
      const { data, error } = await this.sb.rpc("is_member");
      if (error) throw new Error(errMsg(error));
      return !!data;
    }
    async join(code, name) {
      const { error } = await this.sb.rpc("join_group", { code, name });
      if (error) throw new Error(errMsg(error));
    }
    async loadAll() {
      const [p, g, e, c] = await Promise.all([
        this.sb.from("profiles").select("id, display_name, color, created_at"),
        this.sb.from("games").select("id, title, platform, year, cover_url, added_by, created_at, igdb_id"),
        this.sb.from("entries").select("id, game_id, user_id, status, rating, hours, review, spoiler, started_at, finished_at, created_at, updated_at"),
        this.sb.from("catalog_games").select(CATALOG_COLS),
      ]);
      const err = p.error || g.error || e.error;
      if (err) throw new Error(errMsg(err));
      return {
        profiles: p.data,
        games: g.data,
        entries: e.data.map((x) => ({ ...x, rating: x.rating == null ? null : Number(x.rating), hours: x.hours == null ? null : Number(x.hours) })),
        catalog: c.error ? [] : c.data.map(cleanCatalog),
      };
    }
    async addGame(fields) {
      const { data, error } = await this.sb.from("games").insert(fields).select().single();
      if (error) throw new Error(errMsg(error));
      return data;
    }
    async updateGame(id, fields) {
      const { error } = await this.sb.from("games").update(fields).eq("id", id);
      if (error) throw new Error(errMsg(error));
    }
    async deleteGame(id) {
      const { error, count } = await this.sb.from("games").delete({ count: "exact" }).eq("id", id);
      if (error) throw new Error(errMsg(error));
      if (count === 0) throw new Error("Only the friend who added this game can delete it.");
    }
    async saveEntry(existingId, gameId, fields) {
      if (existingId) {
        const { error } = await this.sb.from("entries").update(fields).eq("id", existingId);
        if (error) throw new Error(errMsg(error));
      } else {
        const { error } = await this.sb.from("entries").insert({ ...fields, game_id: gameId });
        if (error) throw new Error(errMsg(error));
      }
    }
    async deleteEntry(id) {
      const { error } = await this.sb.from("entries").delete().eq("id", id);
      if (error) throw new Error(errMsg(error));
    }
    async updateProfile(userId, fields) {
      const { error } = await this.sb.from("profiles").update(fields).eq("id", userId);
      if (error) throw new Error(errMsg(error));
    }
    async addHours(entryId, delta) {
      const { data, error } = await this.sb.rpc("add_hours", { entry: entryId, delta });
      if (error) throw new Error(errMsg(error));
      if (data == null) throw new Error("Couldn't update your hours. Pull down to refresh and try again.");
      return Number(data);
    }
    async linkGame(gameId, igdbId) {
      const { error } = await this.sb.from("games").update({ igdb_id: igdbId }).eq("id", gameId);
      if (error) throw new Error(errMsg(error));
    }
    async catalog(body) {
      let res;
      try { res = await this.sb.functions.invoke("catalog", { body }); }
      catch (_) { throw catalogError(); }
      if (res.error) {
        let code = null;
        try { code = (await res.error.context.json()).error; } catch (_) {}
        throw catalogError(code);
      }
      return res.data;
    }
    async catalogSearch(q) { return (await this.catalog({ action: "search", q })).results || []; }
    async catalogGet(igdbId) { return (await this.catalog({ action: "get", igdb_id: igdbId })).game; }
    async catalogSimilar(ids) { return (await this.catalog({ action: "similar", ids })).games || []; }
    async catalogSteam(igdbId) { return (await this.catalog({ action: "steam", igdb_id: igdbId })).steam || null; }
    async catalogRefresh(ids) { return ((await this.catalog({ action: "refresh", ids })).games || []).map(cleanCatalog); }
    async catalogDiscover() {
      const d = await this.catalog({ action: "discover" });
      return { built_at: d.built_at, has_history: !!d.has_history, trending: d.trending || [], upcoming: d.upcoming || [] };
    }
    subscribe(onChange) {
      this.unsubscribe();
      try {
        this.channel = this.sb
          .channel("savepoint-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, onChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "games" }, onChange)
          .subscribe();
      } catch (_) { /* live updates are optional */ }
    }
    unsubscribe() {
      if (this.channel) { try { this.sb.removeChannel(this.channel); } catch (_) {} this.channel = null; }
    }
  }

  // ---------------- Demo ----------------
  const DEMO_KEY = "savepoint-demo-v4";
  const ME = "demo-me";

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());
  }
  function daysAgo(d, h = 0) {
    return new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();
  }
  // Local calendar day n days from today, as YYYY-MM-DD, and the way IGDB writes it ("Nov 11, 2026").
  function dayFromNow(n) {
    const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function humanDay(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function demoRow(g) {
    const date = g.rel != null ? dayFromNow(g.rel) : g.year ? g.year + "-06-01" : null;
    return {
      igdb_id: g.igdb_id, name: g.name, cover_image_id: null, cover_color: g.color || null,
      first_release_date: date, release_human: g.rel != null ? humanDay(date) : g.human || null, hypes: g.hypes || null,
      platforms: g.platforms, genres: g.genres, summary: g.summary, critic_score: g.critic_score ?? null, critic_count: g.critic_count ?? null,
      igdb_url: null, steam_appid: g.steam || null, similar_ids: DEMO_SIMILAR[g.igdb_id] || [],
      steam_desc: null, steam_pct: null, steam_total: null, steam_players: null, steam_fetched_at: null,
      fetched_at: new Date().toISOString(),
    };
  }
  function seed() {
    const P = [
      { id: ME, display_name: "Sam", color: 3 },
      { id: "demo-maya", display_name: "Maya", color: 0 },
      { id: "demo-jon", display_name: "Jon", color: 2 },
      { id: "demo-priya", display_name: "Priya", color: 4 },
    ];
    const G = [
      ["Hades II", "PC", 2025], ["Balatro", "Switch", 2024], ["Elden Ring", "PS5", 2022],
      ["Celeste", "Switch", 2018], ["Baldur's Gate 3", "PC", 2023], ["Animal Well", "PS5", 2024],
      ["Outer Wilds", "PC", 2019], ["Stardew Valley", "Switch", 2016], ["Astro Bot", "PS5", 2024],
      ["Hollow Knight: Silksong", "Switch", 2025], ["Disco Elysium", "PC", 2019], ["Tetris Effect", "Quest", 2018],
      ["Ghost Harbor", "PC", null], ["Lantern Road", null, null],
    ].map(([title, platform, year], i) => ({
      id: "g" + i, title, platform, year, cover_url: null, igdb_id: { 0: 9001, 2: 9004, 12: 9011, 13: 9013 }[i] || null,
      added_by: P[i % 4].id, created_at: daysAgo(40 - i),
    }));
    const E = [];
    const add = (g, u, status, rating, hours, review, d, h) =>
      E.push({ id: uid(), game_id: "g" + g, user_id: u, status, rating, hours, review, spoiler: false,
        started_at: status === "want" ? null : daysAgo(d + 5 + Math.round((hours || 0) / 3), h),
        finished_at: status === "finished" ? daysAgo(d, h) : null,
        created_at: daysAgo(d + 5, h), updated_at: daysAgo(d, h) });
    add(0, "demo-maya", "playing", null, 22, "", 0, 2);
    add(1, "demo-jon", "finished", 4.5, 31, "One more run turned into 3am. The joker synergies are absurd once you see them.", 0, 5);
    add(2, ME, "finished", 5, 118, "Stormveil alone is worth it. Took me 40 tries on Malenia and I'd do it again.", 1, 1);
    add(2, "demo-priya", "paused", 4, 46, "Gorgeous but I need a break from dying.", 3, 0);
    add(3, "demo-priya", "finished", 5, 14, "Tight controls, kind story. Farewell chapter is brutal.", 2, 3);
    add(4, "demo-maya", "finished", 5, 140, "Played a bard who solved every fight by talking. Best RPG in years.", 4, 0);
    add(4, ME, "playing", null, 35, "", 0, 8);
    add(5, "demo-jon", "want", null, null, "", 5, 0);
    add(6, "demo-priya", "finished", 5, 25, "The ending loops you back to the very first campfire, and it finally makes sense.", 6, 0);
    E[E.length - 1].spoiler = true;
    add(6, ME, "want", null, null, "", 6, 4);
    add(7, "demo-maya", "playing", null, 80, "", 1, 6);
    add(7, "demo-jon", "dropped", 2.5, 9, "Farming isn't for me, but I see the appeal.", 9, 0);
    add(8, ME, "finished", 4.5, 15, "Pure joy. Every level has a new trick.", 7, 0);
    add(8, "demo-jon", "finished", 4, 12, "", 8, 0);
    add(9, "demo-jon", "playing", null, 18, "", 0, 1);
    add(10, "demo-maya", "want", null, null, "", 10, 0);
    add(11, "demo-priya", "finished", 4, 10, "Zone mode in VR is something else.", 12, 0);
    add(1, ME, "finished", 4, 20, "Dangerously moreish.", 11, 0);
    add(11, ME, "dropped", 3, 4, "", 14, 0);
    add(12, ME, "want", null, null, "", 2, 0);
    add(13, "demo-maya", "want", null, null, "", 3, 0);
    add(12, "demo-jon", "want", null, null, "", 4, 0);
    const C = [9001, 9004, 9011, 9013].map((id) => demoRow(DEMO_CATALOG.find((x) => x.igdb_id === id)));
    return { profiles: P, games: G, entries: E, catalog: C };
  }

  const DEMO_CATALOG = [
    { igdb_id: 9001, name: "Hades II", year: 2025, platforms: ["PC", "Switch", "PS5"], genres: ["Roguelike", "Action"], summary: "Battle beyond the Underworld as the Princess of the Underworld.", critic_score: 94, critic_count: 60, color: "#b5442f", steam: "1145350" },
    { igdb_id: 9002, name: "Hollow Knight", year: 2017, platforms: ["PC", "Switch", "PS4", "XONE"], genres: ["Metroidvania", "Platform"], summary: "Forge your own path in an epic action adventure through a ruined kingdom of insects.", critic_score: 88, critic_count: 70 },
    { igdb_id: 9003, name: "Hollow Knight: Silksong", year: 2025, platforms: ["PC", "Switch", "PS5"], genres: ["Metroidvania"], summary: "Play as Hornet and explore a vast haunted kingdom.", critic_score: 91, critic_count: 80 },
    { igdb_id: 9004, name: "Elden Ring", year: 2022, platforms: ["PC", "PS5", "Series X|S"], genres: ["RPG", "Adventure"], summary: "Rise, Tarnished, and be guided by grace.", critic_score: 95, critic_count: 90, color: "#a48c4c", steam: "1245620" },
    { igdb_id: 9005, name: "Zelda: Tears of the Kingdom", year: 2023, platforms: ["Switch"], genres: ["Adventure"], summary: "An epic adventure across the land and skies of Hyrule.", critic_score: 96, critic_count: 100 },
    { igdb_id: 9006, name: "Halo Infinite", year: 2021, platforms: ["PC", "XSX"], genres: ["Shooter"], summary: "Master Chief returns.", critic_score: 84, critic_count: 70 },
    { igdb_id: 9007, name: "Stardew Valley", year: 2016, platforms: ["PC", "Switch", "PS4", "iOS"], genres: ["Simulator", "RPG"], summary: "You've inherited your grandfather's old farm plot.", critic_score: 89, critic_count: 40 },
    { igdb_id: 9008, name: "Dark Souls III", year: 2016, platforms: ["PC", "PS4", "XONE"], genres: ["RPG"], summary: "As fires fade and the world falls into ruin.", critic_score: 89, critic_count: 80 },
    { igdb_id: 9009, name: "Sekiro: Shadows Die Twice", year: 2019, platforms: ["PC", "PS4", "XONE"], genres: ["Adventure"], summary: "Carve your own clever path to vengeance.", critic_score: 90, critic_count: 90 },
    { igdb_id: 9010, name: "Dead Cells", year: 2018, platforms: ["PC", "Switch", "PS4"], genres: ["Roguelike", "Platform"], summary: "Explore a sprawling, ever-changing castle.", critic_score: 89, critic_count: 50 },
    // Made-up upcoming games for the demo calendar (dates are relative to today)
    { igdb_id: 9011, name: "Ghost Harbor", rel: 12, platforms: ["PC", "PS5"], genres: ["Adventure"], summary: "A fishing town, a lighthouse that's been dark for forty years, and a ferry that only runs at night.", color: "#3f6f9a", hypes: 40 },
    { igdb_id: 9012, name: "Starfall Tactics", rel: 3, platforms: ["PC", "Switch"], genres: ["Strategy"], summary: "Turn-based squad tactics on a crumbling orbital station.", color: "#6a4fa8", hypes: 25 },
    { igdb_id: 9013, name: "Lantern Road", human: "2027", platforms: ["PC", "PS5", "Series X|S"], genres: ["RPG"], summary: "Walk a caravan across a desert that rearranges itself every night.", color: "#b07a35", hypes: 60 },
    { igdb_id: 9014, name: "Neon Drift", rel: 25, platforms: ["PS5", "Series X|S"], genres: ["Racing"], summary: "Arcade street racing through a city that never turns its lights off.", color: "#b0386f", hypes: 18 },
    { igdb_id: 9015, name: "Moonlit Kingdoms", rel: 48, platforms: ["Switch"], genres: ["Simulator"], summary: "Build a kingdom that only wakes up after dark.", color: "#3c5f8f", hypes: 30 },
    { igdb_id: 9016, name: "Iron Tide", rel: 90, platforms: ["PC", "PS5", "Series X|S"], genres: ["Shooter"], summary: "Naval warfare in a drowned world.", color: "#4a5c66", hypes: 55 },
  ];
  const DEMO_STEAM = {
    9001: { desc: "Overwhelmingly Positive", pct: 96, total: 98213, players: 8210 },
    9004: { desc: "Very Positive", pct: 93, total: 754321, players: 41020 },
  };
  const DEMO_SIMILAR = { 9001: [9010, 9002], 9004: [9008, 9009, 9002] };

  class DemoApi {
    constructor() {
      this.demo = true;
      this.load();
    }
    load() {
      try { this.db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (_) { this.db = null; }
      if (!this.db || !this.db.games) this.db = seed();
    }
    save() {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.db)); } catch (_) {}
    }
    reset() { this.db = seed(); this.save(); }
    async session() { return { userId: ME, email: "demo@example.com" }; }
    onAuthChange() {}
    async isMember() { return true; }
    async loadAll() {
      const copy = JSON.parse(JSON.stringify(this.db));
      copy.catalog = copy.catalog || [];
      return copy;
    }
    async catalogSearch(q) {
      await new Promise((r) => setTimeout(r, 250));
      const n = String(q || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (n.length < 2) return [];
      return DEMO_CATALOG.filter((g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, "").includes(n))
        .map((g) => ({ igdb_id: g.igdb_id, name: g.name, year: g.year || (g.rel != null ? Number(dayFromNow(g.rel).slice(0, 4)) : null), cover_image_id: null, platforms: g.platforms }));
    }
    async catalogSimilar(ids) {
      await new Promise((r) => setTimeout(r, 150));
      return DEMO_CATALOG.filter((g) => ids.includes(g.igdb_id))
        .map((g) => ({ igdb_id: g.igdb_id, name: g.name, year: g.year, cover_image_id: null, platforms: g.platforms, critic_score: g.critic_score, critic_count: g.critic_count }));
    }
    async catalogGet(igdbId) {
      const g = DEMO_CATALOG.find((x) => x.igdb_id === igdbId);
      if (!g) throw new Error("That game isn't in the games database any more.");
      const old = (this.db.catalog || []).find((x) => x.igdb_id === igdbId);
      const row = old || demoRow(g);
      if (!old) { this.db.catalog = (this.db.catalog || []).concat(row); this.save(); }
      return { ...row };
    }
    async catalogSteam(igdbId) {
      await new Promise((r) => setTimeout(r, 300));
      const st = DEMO_STEAM[igdbId];
      if (!st) return null;
      const row = (this.db.catalog || []).find((x) => x.igdb_id === igdbId);
      const fetched_at = new Date().toISOString();
      if (row) { Object.assign(row, { steam_desc: st.desc, steam_pct: st.pct, steam_total: st.total, steam_players: st.players, steam_fetched_at: fetched_at }); this.save(); }
      return { ...st, fetched_at, appid: row ? row.steam_appid : null };
    }
    async catalogRefresh(ids) {
      return (this.db.catalog || []).filter((x) => ids.includes(x.igdb_id)).map((x) => ({ ...x }));
    }
    async catalogDiscover() {
      await new Promise((r) => setTimeout(r, 250));
      const light = (g) => ({ igdb_id: g.igdb_id, name: g.name, year: g.year || null, cover_image_id: null, platforms: g.platforms, critic_score: g.critic_score ?? null });
      const reasons = { 9006: "+38% players this week", 9002: "Popular on Steam right now", 9010: "+6% Steam reviews this week", 9005: "Big on Twitch right now", 9007: "Popular on Steam right now", 9009: "Popular on Steam right now" };
      const trending = Object.keys(reasons).map(Number).map((id) => ({ ...light(DEMO_CATALOG.find((x) => x.igdb_id === id)), reason: reasons[id] }));
      const upcoming = DEMO_CATALOG.filter((g) => g.rel != null || g.human).map((g) => {
        const date = g.rel != null ? dayFromNow(g.rel) : null;
        return { ...light(g), year: date ? Number(date.slice(0, 4)) : null, date, human: date ? humanDay(date) : g.human, hypes: g.hypes || 0, wish_rank: null };
      }).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
      return { built_at: new Date().toISOString(), has_history: true, trending, upcoming };
    }
    async linkGame(gameId, igdbId) {
      if (igdbId != null && this.db.games.some((x) => x.igdb_id === igdbId && x.id !== gameId)) throw new Error("That game is already on the shelf.");
      const g = this.db.games.find((x) => x.id === gameId); if (g) g.igdb_id = igdbId; this.save();
    }
    async addHours(entryId, delta) {
      const e = this.db.entries.find((x) => x.id === entryId && x.user_id === ME);
      if (!e) throw new Error("Couldn't update your hours.");
      e.hours = Math.round(Math.min(99999, Math.max(0, (e.hours || 0) + delta)) * 10) / 10;
      e.updated_at = new Date().toISOString(); this.save();
      return e.hours;
    }
    async addGame(fields) {
      if (fields.igdb_id != null && this.db.games.some((x) => x.igdb_id === fields.igdb_id)) throw new Error("That game is already on the shelf.");
      const g = { id: uid(), cover_url: null, platform: null, year: null, igdb_id: null, ...fields, added_by: ME, created_at: new Date().toISOString() };
      this.db.games.push(g); this.save(); return g;
    }
    async updateGame(id, fields) {
      const g = this.db.games.find((x) => x.id === id); if (g) Object.assign(g, fields); this.save();
    }
    async deleteGame(id) {
      const g = this.db.games.find((x) => x.id === id);
      if (g && g.added_by !== ME) throw new Error("Only the friend who added this game can delete it.");
      this.db.games = this.db.games.filter((x) => x.id !== id);
      this.db.entries = this.db.entries.filter((x) => x.game_id !== id); this.save();
    }
    async saveEntry(existingId, gameId, fields) {
      const now = new Date().toISOString();
      const e = existingId && this.db.entries.find((x) => x.id === existingId);
      const prev = e ? e.status : null;
      const row = e || { id: uid(), game_id: gameId, user_id: ME, rating: null, hours: null, review: null, spoiler: false, started_at: null, finished_at: null, created_at: now };
      Object.assign(row, fields, { updated_at: now });
      if (row.status === "playing" && !row.started_at && prev !== "playing") row.started_at = now;
      if (row.status === "finished" && !row.finished_at && prev !== "finished") row.finished_at = now;
      if (!e) this.db.entries.push(row);
      this.save();
    }
    async deleteEntry(id) { this.db.entries = this.db.entries.filter((x) => x.id !== id); this.save(); }
    async updateProfile(userId, fields) {
      const p = this.db.profiles.find((x) => x.id === userId); if (p) Object.assign(p, fields); this.save();
    }
    async signOut() {}
    subscribe() {}
    unsubscribe() {}
  }

  window.SavePointApi = { SupabaseApi, DemoApi, errMsg };
})();
