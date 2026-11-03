// S17/S18: saving a log instantly with rollback, serialised per game; quick sessions via the add_hours RPC.
import { reload } from "../../app/reload.js";
import { S, idx, myEntry, reindex } from "../../core/state.js";
import { $, debounce, fmtHours, fromDateInput } from "../../core/util.js";
import { toast } from "../../ui/feedback.js";
import { renderMain } from "../../ui/screen.js";
import { refreshOpenSheet, renderSheet } from "../../ui/sheet.js";

export function syncDraftFromForm() {
  const f = $('form[data-form="entry"], form[data-form="finish"]');
  if (!f || !S.draft) return;
  if (f.hours) {
    const h = f.hours.value.trim();
    S.draft.hours = h === "" ? null : Number(h);
  }
  if (f.review) S.draft.review = f.review.value;
  if (f.spoiler) S.draft.spoiler = f.spoiler.checked;
  if (f.started_at) S.draft.started_at = fromDateInput(f.started_at.value);
  if (f.finished_at) S.draft.finished_at = fromDateInput(f.finished_at.value);
}

// ---------------- S18: instant saves ----------------
export const syncSoon = debounce(() => reload().catch(() => {}), 1500);

function applyLocalEntry(gameId, fields) {
  const now = new Date().toISOString();
  let e = myEntry(gameId);
  const prev = e ? e.status : null;
  if (!e) {
    e = {
      id: "tmp-" + Math.random().toString(36).slice(2),
      game_id: gameId,
      user_id: S.me,
      rating: null,
      hours: null,
      review: null,
      spoiler: false,
      started_at: null,
      finished_at: null,
      created_at: now,
    };
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
  next
    .finally(() => {
      if (S.pending[gameId] === next) delete S.pending[gameId];
    })
    .catch(() => {});
  return next;
}

export async function saveEntryOptimistic(gameId, fields, okMsg) {
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
    S.entries = JSON.parse(snapshot);
    reindex();
    renderMain();
    if (S.sheet) renderSheet();
    toast(e.message || "Couldn't save. Check your connection and try again.");
    return false;
  }
}

// S17: quick session buttons
// opts.undo: offer Undo in the toast. opts.undone: this call is the undo.
export async function quickHours(gameId, delta, opts = {}) {
  const e = myEntry(gameId);
  if (!e || !delta) return;
  const before = e.hours;
  e.hours = Math.round(Math.min(99999, Math.max(0, (e.hours || 0) + delta)) * 10) / 10;
  e.updated_at = new Date().toISOString();
  reindex();
  renderMain();
  refreshOpenSheet();
  if (S.draft && S.draft.gameId === gameId) {
    S.draft.hours = e.hours;
    const f = $('form[data-form="entry"]');
    if (f && f.hours) f.hours.value = e.hours;
  }
  const g = idx.g[gameId];
  if (opts.undone) toast(`Undone. ${fmtHours(e.hours) || "0h"} on ${g ? g.title : "this game"}`);
  else
    toast(
      `+${delta < 1 ? "30m" : delta + "h"} on ${g ? g.title : "this game"} (${fmtHours(e.hours)} total)`,
      opts.undo ? { label: "Undo", fn: () => quickHours(gameId, -delta, { undone: true }) } : undefined,
    );
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
    const cur = myEntry(gameId);
    if (cur) cur.hours = before;
    reindex();
    renderMain();
    refreshOpenSheet();
    toast(err.message);
  }
}
