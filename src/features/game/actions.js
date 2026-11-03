// Game page actions and the log/finish/edit forms.
import { reload } from "../../app/reload.js";
import { S, catRow, idx, myEntry, reindex } from "../../core/state.js";
import { $, norm } from "../../core/util.js";
import { gameFields } from "./edit.js";
import { addFromCatalog, openRow } from "./ext.js";
import { quickHours, saveEntryOptimistic, syncDraftFromForm, syncSoon } from "./log.js";
import { spoilerText } from "../../ui/cover.js";
import { busy, confirmDialog, toast } from "../../ui/feedback.js";
import { renderMain } from "../../ui/screen.js";
import { closeSheet, openSheet, renderSheet, rerenderKeepScroll } from "../../ui/sheet.js";

export const gameActions = {
  "open-game"(el) {
    S.draft = null;
    openSheet({ kind: "game", id: el.dataset.id }, !!(S.sheet && S.sheet.kind === "friend"));
  },
  "open-row"(el) {
    openRow(Number(el.dataset.igdb), el.dataset.why);
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
        if (status === "finished") {
          S.draft = null;
          openSheet({ kind: "finish", id: gameId }, true);
        }
      } catch (e) {
        const err = $("#layer .error");
        if (err) err.textContent = e.message;
        else toast(e.message);
      }
    });
  },
  "ext-more"() {
    const sh = S.sheet;
    const full = catRow(sh.igdb);
    const row = {
      ...(sh.row || {}),
      igdb_id: sh.igdb,
      name: (full && full.name) || (sh.row && sh.row.name),
      platforms: (full && full.platforms) || (sh.row && sh.row.platforms) || [],
      cover_image_id: (full && full.cover_image_id) || (sh.row && sh.row.cover_image_id),
    };
    S.cat = { q: row.name, results: [row], loading: false, error: null, picked: row, platform: null };
    openSheet({ kind: "add", mode: "search", status: "want" }, true);
  },
  async "quick-hours"(el) {
    quickHours(el.dataset.id, Number(el.dataset.delta));
  },
  reveal(el) {
    const e = S.entries.find((x) => x.id === el.dataset.id);
    if (!e) return;
    S.revealed.add(e.id);
    el.outerHTML = spoilerText(e, el.classList.contains("quote") ? "quote" : "review-text");
  },
  more(el) {
    const p = $("#summary");
    if (p) {
      p.classList.toggle("open");
      el.textContent = p.classList.contains("open") ? "Less" : "More";
    }
  },
  "edit-game"(el) {
    openSheet({ kind: "edit", id: el.dataset.id }, true);
  },
  "pick-status"(el) {
    S.draft.status = el.dataset.status;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
  },
  rate(el, ev) {
    const n = Number(el.dataset.n);
    let val = n;
    if (ev.detail > 0) {
      // pointer click: left half = half star
      const r = el.getBoundingClientRect();
      if (ev.clientX - r.left < r.width / 2) val = n - 0.5;
    }
    syncDraftFromForm();
    S.draft.rating = val;
    rerenderKeepScroll();
  },
  "clear-rating"() {
    syncDraftFromForm();
    S.draft.rating = null;
    rerenderKeepScroll();
  },
  async "remove-entry"(el) {
    const ok = await confirmDialog({
      title: "Remove from your shelf?",
      body: "Your status, rating, hours and review for this game will be deleted. The game stays on the group shelf.",
      ok: "Remove",
      danger: true,
    });
    if (!ok) return;
    const id = el.dataset.id;
    const before = S.entries.slice();
    S.entries = S.entries.filter((x) => x.id !== id);
    S.draft = null;
    reindex();
    renderMain();
    renderSheet();
    toast("Removed from your shelf");
    try {
      await S.api.deleteEntry(id);
      syncSoon();
    } catch (e) {
      S.entries = before;
      reindex();
      renderMain();
      renderSheet();
      toast(e.message);
    }
  },
  async "delete-game"(el) {
    const id = el.dataset.id;
    const n = (idx.byGame[id] || []).filter((e) => e.user_id !== S.me).length;
    const ok = await confirmDialog({
      title: `Delete ${idx.g[id].title}?`,
      body: n
        ? `This removes it for everyone, including ${n} ${n === 1 ? "friend's log" : "friends' logs"} and reviews.`
        : "This removes it from the group shelf.",
      ok: "Delete game",
      danger: true,
    });
    if (!ok) return;
    try {
      await S.api.deleteGame(id);
      closeSheet();
      await reload();
      toast("Game deleted");
    } catch (e) {
      toast(e.message);
    }
  },
};

export const gameForms = {
  async entry() {
    syncDraftFromForm();
    const d = S.draft;
    if (d.hours != null && (!Number.isFinite(d.hours) || d.hours < 0))
      throw new Error("Hours should be a number like 12 or 3.5.");
    if (d.started_at && d.finished_at && d.finished_at < d.started_at)
      throw new Error("The finish date is before the start date.");
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
    const d = S.draft,
      gameId = f.dataset.id;
    const review = (d.review || "").trim();
    S.draft = null;
    const saving = saveEntryOptimistic(
      gameId,
      { rating: d.rating, review: review || null, spoiler: !!d.spoiler && !!review },
      "Saved. Nice work finishing it.",
    );
    openSheet({ kind: "game", id: gameId });
    await saving;
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
};
