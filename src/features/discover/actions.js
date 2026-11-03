// Discover actions: view toggle, retry, platform filter, one-tap Want to play.
import { ICON } from "../../core/constants.js";
import { S } from "../../core/state.js";
import { lsSet } from "../../core/util.js";
import { loadDiscover } from "./load.js";
import { addFromCatalog } from "../game/ext.js";
import { findRow } from "../picks/picks.js";
import { toast } from "../../ui/feedback.js";
import { renderMain, safeRenderMain } from "../../ui/screen.js";

export const discoverActions = {
  "disc-view"(el) { S.discView = el.dataset.v; lsSet("sp-disc-view", S.discView); renderMain(); },
  "disc-retry"() { loadDiscover(true); },
  plat(el) { S.plat = el.dataset.p; lsSet("sp-plat", S.plat); renderMain(); },
  async "quick-want"(el) {
    const id = Number(el.dataset.igdb);
    const row = findRow(id);
    el.disabled = true; el.setAttribute("aria-pressed", "true"); el.innerHTML = ICON.check;
    try {
      await addFromCatalog(id, "want", { light: row });
      toast(`${row ? row.name : "Game"} added to Want to play`);
      safeRenderMain();
    } catch (e) {
      if (el.isConnected) { el.disabled = false; el.setAttribute("aria-pressed", "false"); el.innerHTML = ICON.plus; }
      toast(e.message);
    }
  },
};
