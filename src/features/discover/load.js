// S33/S34: trending + upcoming releases (server caches 6 hours, we keep a copy for 3).
import { S } from "../../core/state.js";
import { lsGet, lsSet, safeJson } from "../../core/util.js";
import { safeRenderMain } from "../../ui/screen.js";

let discLoading = false;
export async function loadDiscover(force) {
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
