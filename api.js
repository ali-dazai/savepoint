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
    return m;
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
      const [p, g, e] = await Promise.all([
        this.sb.from("profiles").select("id, display_name, color, created_at"),
        this.sb.from("games").select("id, title, platform, year, cover_url, added_by, created_at"),
        this.sb.from("entries").select("id, game_id, user_id, status, rating, hours, review, created_at, updated_at"),
      ]);
      const err = p.error || g.error || e.error;
      if (err) throw new Error(errMsg(err));
      return {
        profiles: p.data,
        games: g.data,
        entries: e.data.map((x) => ({ ...x, rating: x.rating == null ? null : Number(x.rating), hours: x.hours == null ? null : Number(x.hours) })),
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
  const DEMO_KEY = "savepoint-demo-v1";
  const ME = "demo-me";

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now());
  }
  function daysAgo(d, h = 0) {
    return new Date(Date.now() - d * 864e5 - h * 36e5).toISOString();
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
    ].map(([title, platform, year], i) => ({
      id: "g" + i, title, platform, year, cover_url: null,
      added_by: P[i % 4].id, created_at: daysAgo(40 - i),
    }));
    const E = [];
    const add = (g, u, status, rating, hours, review, d, h) =>
      E.push({ id: uid(), game_id: "g" + g, user_id: u, status, rating, hours, review, created_at: daysAgo(d + 5, h), updated_at: daysAgo(d, h) });
    add(0, "demo-maya", "playing", null, 22, "", 0, 2);
    add(1, "demo-jon", "finished", 4.5, 31, "One more run turned into 3am. The joker synergies are absurd once you see them.", 0, 5);
    add(2, ME, "finished", 5, 118, "Stormveil alone is worth it. Took me 40 tries on Malenia and I'd do it again.", 1, 1);
    add(2, "demo-priya", "paused", 4, 46, "Gorgeous but I need a break from dying.", 3, 0);
    add(3, "demo-priya", "finished", 5, 14, "Tight controls, kind story. Farewell chapter is brutal.", 2, 3);
    add(4, "demo-maya", "finished", 5, 140, "Played a bard who solved every fight by talking. Best RPG in years.", 4, 0);
    add(4, ME, "playing", null, 35, "", 0, 8);
    add(5, "demo-jon", "want", null, null, "", 5, 0);
    add(6, "demo-priya", "finished", 5, 25, "Go in knowing nothing. That's the whole review.", 6, 0);
    add(6, ME, "want", null, null, "", 6, 4);
    add(7, "demo-maya", "playing", null, 80, "", 1, 6);
    add(7, "demo-jon", "dropped", 2.5, 9, "Farming isn't for me, but I see the appeal.", 9, 0);
    add(8, ME, "finished", 4.5, 15, "Pure joy. Every level has a new trick.", 7, 0);
    add(8, "demo-jon", "finished", 4, 12, "", 8, 0);
    add(9, "demo-jon", "playing", null, 18, "", 0, 1);
    add(10, "demo-maya", "want", null, null, "", 10, 0);
    add(11, "demo-priya", "finished", 4, 10, "Zone mode in VR is something else.", 12, 0);
    return { profiles: P, games: G, entries: E };
  }

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
    async loadAll() { return JSON.parse(JSON.stringify(this.db)); }
    async addGame(fields) {
      const g = { id: uid(), cover_url: null, platform: null, year: null, ...fields, added_by: ME, created_at: new Date().toISOString() };
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
      if (e) Object.assign(e, fields, { updated_at: now });
      else this.db.entries.push({ id: uid(), game_id: gameId, user_id: ME, rating: null, hours: null, review: null, ...fields, created_at: now, updated_at: now });
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
