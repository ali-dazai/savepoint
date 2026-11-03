// Actions that belong to the shell itself rather than a feature: tabs, closing sheets, the update banner.
import { tabs } from "./registry.js";
import { reload } from "./reload.js";
import { S } from "../core/state.js";
import { lsSet } from "../core/util.js";
import { renderMain } from "../ui/screen.js";
import { goBack } from "../ui/sheet.js";
import { applyUpdate } from "../ui/update.js";

export const shellActions = {
  tab(el) {
    const t = el.dataset.tab;
    const tab = tabs.find((x) => x.id === t) || {};
    // Re-tapping the current tab scrolls to the top and refreshes.
    if (S.tab === t) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      reload().catch(() => {});
      if (tab.onReselect) tab.onReselect();
      return;
    }
    S.tab = t;
    lsSet("sp-tab", t);
    renderMain();
    window.scrollTo(0, 0);
    if (tab.onEnter) tab.onEnter();
  },
  "update-refresh"() {
    applyUpdate();
  },
  close() {
    goBack();
  },
  backdrop(el, ev) {
    if (ev.target === el) goBack();
  },
};
