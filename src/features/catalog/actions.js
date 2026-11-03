// Add/link flow actions and the add-by-hand form.
import { reload } from "../../app/reload.js";
import { S, idx } from "../../core/state.js";
import { $, norm } from "../../core/util.js";
import { runCatalogSearch } from "./sheet.js";
import { gameFields } from "../game/edit.js";
import { addFromCatalog } from "../game/ext.js";
import { busy, confirmDialog, toast } from "../../ui/feedback.js";
import { openSheet, renderSheet } from "../../ui/sheet.js";

export const catalogActions = {
  "add-game"(el) {
    const title = el.dataset.title || "";
    S.cat = { q: title, results: [], loading: false, error: null, picked: null, platform: null };
    openSheet({ kind: "add", title, status: "playing", mode: S.api.catalogSearch ? "search" : "manual" });
    if (title) runCatalogSearch(title);
  },
  "cat-manual"() {
    const t = (S.cat && S.cat.q) || "";
    const back = S.back;
    openSheet({ ...S.sheet, mode: "manual", title: t });
    S.back = back;
  },
  "cat-back"() {
    const back = S.back;
    openSheet({ ...S.sheet, mode: "search" });
    S.back = back;
  },
  "cat-pick"(el) {
    const id = Number(el.dataset.igdb);
    const r = (S.cat.results || []).find((x) => x.igdb_id === id);
    if (!r) return;
    S.cat.picked = r;
    S.cat.platform = null;
    renderSheet();
  },
  "cat-unpick"() {
    S.cat.picked = null;
    renderSheet();
  },
  "cat-platform"(el) {
    S.cat.platform = S.cat.platform === el.dataset.p ? null : el.dataset.p;
    el.parentElement
      .querySelectorAll("button")
      .forEach((b) => b.setAttribute("aria-pressed", b.dataset.p === S.cat.platform));
  },
  async "cat-add"(el) {
    const pk = S.cat.picked;
    const err = $(".sheet .error");
    await busy(el, async () => {
      try {
        const existing = idx.byIgdb[pk.igdb_id];
        if (existing) {
          S.draft = null;
          return openSheet({ kind: "game", id: existing.id });
        }
        const gameId = await addFromCatalog(pk.igdb_id, S.sheet.status || "playing", {
          platform: S.cat.platform,
          light: pk,
        });
        S.draft = null;
        S.cat = null;
        openSheet({ kind: "game", id: gameId });
        toast("Game added");
      } catch (e) {
        if (err && err.isConnected) err.textContent = e.message;
        else toast(e.message);
      }
    });
  },
  "link-start"(el) {
    S.cat = {
      q: idx.g[el.dataset.id] ? idx.g[el.dataset.id].title : "",
      results: [],
      loading: false,
      error: null,
      picked: null,
    };
    openSheet({ kind: "add", mode: "search", linkId: el.dataset.id });
    if (S.cat.q) runCatalogSearch(S.cat.q);
  },
  async "cat-link"(el) {
    const gameId = S.sheet.linkId,
      pk = S.cat.picked;
    const err = $(".sheet .error");
    await busy(el, async () => {
      try {
        await S.api.catalogGet(pk.igdb_id);
        await S.api.linkGame(gameId, pk.igdb_id);
        await reload();
        S.cat = null;
        S.draft = null;
        openSheet({ kind: "game", id: gameId });
        toast("Game linked");
      } catch (e) {
        if (err && err.isConnected) err.textContent = e.message;
        else toast(e.message);
      }
    });
  },
  async unlink(el) {
    const ok = await confirmDialog({
      title: "Unlink this game?",
      body: "It loses the cover art, genres, critic score and Steam reviews from the games database. Logs and reviews stay.",
      ok: "Unlink",
    });
    if (!ok) return;
    try {
      await S.api.linkGame(el.dataset.id, null);
      await reload();
      renderSheet();
      toast("Unlinked");
    } catch (e) {
      toast(e.message);
    }
  },
  "pick-add-status"(el) {
    S.sheet.status = el.dataset.status;
    el.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === el));
  },
};

export const catalogForms = {
  async add(f) {
    const fields = gameFields(f);
    const dupe = S.games.find((g) => norm(g.title) === norm(fields.title));
    if (dupe) throw new Error(`${dupe.title} is already on the shelf. Open it from the suggestion above.`);
    const g = await S.api.addGame(fields);
    const st = S.sheet.status || "playing";
    if (st !== "none") await S.api.saveEntry(null, g.id, { status: st, rating: null, hours: null, review: null });
    await reload();
    S.draft = null;
    S.cat = null;
    openSheet({ kind: "game", id: g.id });
    toast("Game added");
  },
};
