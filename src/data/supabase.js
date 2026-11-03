// SupabaseApi: the real shared database. Everything the UI knows about Supabase is in this folder;
// screens only ever call methods on S.api, which is either this class or DemoApi (same interface).
import { catalogError, errMsg } from "./errors.js";

const CATALOG_COLS = "igdb_id, name, cover_image_id, cover_color, first_release_date, release_human, hypes, platforms, genres, summary, critic_score, critic_count, igdb_url, steam_appid, similar_ids, steam_desc, steam_pct, steam_total, steam_players, steam_fetched_at, fetched_at";
function cleanCatalog(x) {
  return { ...x, critic_score: x.critic_score == null ? null : Number(x.critic_score) };
}

// True when the vendored supabase-js bundle (vendor/supabase.js) has loaded.
export const supabaseLoaded = () => !!window.supabase;

export class SupabaseApi {
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
