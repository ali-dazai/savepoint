// A game that isn't on the shelf yet (from Discover, picks or search): its page, loading its row, adding it.
import { reload } from "../../app/reload.js";
import { IGDB_IMG } from "../../core/constants.js";
import { S, catRow, idx, myEntry, releaseInfo } from "../../core/state.js";
import { esc } from "../../core/util.js";
import { ensureSteam } from "../catalog/upkeep.js";
import { saveEntryOptimistic } from "./log.js";
import { aboutHTML, scoreChips } from "./page.js";
import { findRow } from "../picks/picks.js";
import { openSheet, pageFrame, pageHead, refreshOpenSheet, rerenderKeepScroll } from "../../ui/sheet.js";
import { hueSat, tintFrom } from "../../ui/theme.js";

// A game from Discover or picks that isn't on the shelf yet.
export function extPage(sh) {
  const id = sh.igdb;
  const full = catRow(id);
  const r = full || sh.row || { name: "Game" };
  const name = r.name || "Game";
  const img = r.cover_image_id;
  const year = full && full.first_release_date ? full.first_release_date.slice(0, 4) : r.year;
  const meta = [year, full && full.genres && full.genres[0], (r.platforms || []).slice(0, 3).join(", ")]
    .filter(Boolean)
    .join(", ");
  const tint = tintFrom(full && full.cover_color, id);
  const head = pageHead({
    title: name,
    meta,
    art: { url: img ? IGDB_IMG(img, "cover_big_2x") : "", tint, title: name },
    chips: full
      ? scoreChips(full, null)
      : r.critic_score != null
        ? scoreChips({ critic_score: r.critic_score }, null)
        : "",
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
export async function loadExt(sh) {
  const id = sh.igdb;
  if (idx.byIgdb[id]) return refreshOpenSheet();
  const have = catRow(id);
  if (have && have.summary !== undefined) {
    ensureSteam(id);
    return;
  }
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
export function openRow(igdbId, why) {
  const g = idx.byIgdb[igdbId];
  S.draft = null;
  if (g) return openSheet({ kind: "game", id: g.id }, false);
  const row = findRow(igdbId);
  openSheet({ kind: "ext", igdb: igdbId, row, why: why || "" }, false);
}

// Put a catalogue game on the shelf (or reuse it if a friend already added it) and log a status.
export async function addFromCatalog(igdbId, status, opts = {}) {
  const existing = idx.byIgdb[igdbId];
  if (existing) {
    if (!myEntry(existing.id) && status !== "none")
      await saveEntryOptimistic(existing.id, { status, rating: null, hours: null, review: null });
    return existing.id;
  }
  const full = catRow(igdbId) && catRow(igdbId).summary !== undefined ? catRow(igdbId) : await S.api.catalogGet(igdbId);
  const light = opts.light || findRow(igdbId) || {};
  const year = full.first_release_date ? Number(String(full.first_release_date).slice(0, 4)) : light.year || null;
  let g;
  try {
    g = await S.api.addGame({
      title: full.name || light.name,
      platform: opts.platform || null,
      year,
      cover_url: null,
      igdb_id: igdbId,
    });
  } catch (e) {
    if (/already on the shelf/i.test(e.message)) {
      await reload();
      const ex = idx.byIgdb[igdbId];
      if (ex) {
        if (!myEntry(ex.id) && status !== "none")
          await saveEntryOptimistic(ex.id, { status, rating: null, hours: null, review: null });
        return ex.id;
      }
    }
    throw e;
  }
  if (status !== "none") await S.api.saveEntry(null, g.id, { status, rating: null, hours: null, review: null });
  await reload();
  return g.id;
}
