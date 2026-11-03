// One delegated listener per event type on document. Clicks go to data-act handlers, submits to data-form handlers.
import { actions, forms } from "./registry.js";
import { reload } from "./reload.js";
import { S } from "../core/state.js";
import { $, debounce, esc, lsSet, norm } from "../core/util.js";
import { runCatalogSearch } from "../features/catalog/sheet.js";
import { buildShare } from "../features/share/sheet.js";
import { relayoutShelf, shelfResults } from "../features/shelf/view.js";
import { busy, toast } from "../ui/feedback.js";
import { swallowHoldClick } from "../ui/gestures.js";
import { renderMain } from "../ui/screen.js";
import { goBack } from "../ui/sheet.js";
import { checkForUpdate } from "../ui/update.js";

export function wireEvents() {
  document.addEventListener("click", (ev) => {
    if (swallowHoldClick(ev)) return;
    const el = ev.target.closest("[data-act]");
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === "BUTTON" || el.dataset.act === "backdrop") {
      if (el.dataset.act !== "backdrop") ev.preventDefault();
      fn(el, ev);
    }
  });

  document.addEventListener("submit", async (ev) => {
    const f = ev.target.closest("form[data-form]");
    if (!f) return;
    ev.preventDefault();
    const fn = forms[f.dataset.form];
    if (!fn) return;
    const err = f.querySelector(".error");
    if (err) err.textContent = "";
    const btn = f.querySelector('button[type="submit"]');
    try {
      await busy(btn, () => fn(f, btn));
    } catch (e) {
      const live = document.contains(err) ? err : null;
      if (live) live.textContent = e.message || String(e);
      else toast(e.message || String(e));
    }
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.name === "q") {
      S.search = t.value;
      const box = $("#shelf-results");
      if (box) box.innerHTML = shelfResults();
      return;
    }
    if (t.name === "cat-q") {
      runCatalogSearch(t.value);
      return;
    }
    if (t.form && t.form.dataset.form === "add" && t.name === "title") {
      const box = $("#dupe");
      const q = norm(t.value);
      const hit =
        q.length >= 2 && S.games.find((g) => norm(g.title) === q || (q.length >= 4 && norm(g.title).startsWith(q)));
      box.innerHTML = hit
        ? `<div class="suggest">${esc(hit.title)} is already on the shelf. <button type="button" data-act="open-game" data-id="${hit.id}">Open it</button></div>`
        : "";
    }
  });
  document.addEventListener("change", (ev) => {
    if (ev.target.name === "sort") {
      S.sort = ev.target.value;
      lsSet("sp-sort", S.sort);
      renderMain();
    }
    if (ev.target.name === "share-include" && S.share) {
      S.share.include = ev.target.checked;
      buildShare();
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && S.sheet && !$(".dialog")) goBack();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (S.me) lsSet("sp-seen", new Date().toISOString());
      return;
    }
    if (S.me && Date.now() - S.lastLoad > 20000) reload().catch(() => {});
    checkForUpdate();
  });
  window.addEventListener("resize", debounce(relayoutShelf, 150));
  window.addEventListener("pagehide", () => {
    if (S.me) lsSet("sp-seen", new Date().toISOString());
  });
}
