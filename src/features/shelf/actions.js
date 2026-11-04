// Shelf actions: scope and status filter.
import { S } from "../../core/state.js";
import { lsSet } from "../../core/util.js";
import { renderMain } from "../../ui/screen.js";

export const shelfActions = {
  scope(el) {
    S.scope = el.dataset.scope;
    lsSet("sp-scope", S.scope);
    renderMain();
  },
  "status-filter"(el) {
    S.status = el.dataset.status;
    renderMain();
  },
};
