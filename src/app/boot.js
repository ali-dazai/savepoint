// Boot: pick the backend (demo or Supabase) from config.js and the URL, then hand over to the auth flow.
import { S } from "../core/state.js";
import { lsGet, lsSet } from "../core/util.js";
import { DemoApi, SupabaseApi } from "../data/api.js";
import { afterSignIn, renderAuth, renderLoading, renderNotConfigured } from "../features/auth/screens.js";
import { closeSheet } from "../ui/sheet.js";

export async function start() {
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
