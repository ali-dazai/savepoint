// Entry point. Registers every feature with the shell, wires the document events and boots.
// Adding a feature: write it under src/features/<name>/, then register its tab, sheet kinds, actions and forms here.
import { shellActions } from "./app/actions.js";
import { start } from "./app/boot.js";
import { registerActions, registerForms, registerSheet, registerTab } from "./app/registry.js";
import { wireEvents } from "./app/wiring.js";
import { S, idx, myEntry } from "./core/state.js";
import { $ } from "./core/util.js";
import { authActions, authForms } from "./features/auth/actions.js";
import { catalogActions, catalogForms } from "./features/catalog/actions.js";
import { addSheet } from "./features/catalog/sheet.js";
import { ensureSteam } from "./features/catalog/upkeep.js";
import { discoverActions } from "./features/discover/actions.js";
import { loadDiscover } from "./features/discover/load.js";
import { discoverView } from "./features/discover/view.js";
import { feedView } from "./features/feed/view.js";
import { friendsActions, friendsForms } from "./features/friends/actions.js";
import { friendSheet } from "./features/friends/sheet.js";
import { friendsView } from "./features/friends/view.js";
import { gameActions, gameForms } from "./features/game/actions.js";
import { editSheet } from "./features/game/edit.js";
import { extPage, loadExt } from "./features/game/ext.js";
import { finishSheet } from "./features/game/finish.js";
import { gamePage, othersReviews, sessionsHTML, updatePageChips } from "./features/game/page.js";
import { shareActions } from "./features/share/actions.js";
import { shareSheet } from "./features/share/sheet.js";
import { shelfActions } from "./features/shelf/actions.js";
import { shelfView } from "./features/shelf/view.js";
import { closeSheet, openSheet, renderSheet } from "./ui/sheet.js";
import { registerServiceWorker } from "./ui/update.js";

// Tabs, in display order.
registerTab({ id: "feed", label: "Feed", view: feedView });
registerTab({ id: "shelf", label: "Shelf", view: shelfView });
registerTab({
  id: "discover",
  label: "Discover",
  view: discoverView,
  onEnter: () => loadDiscover(),
  onReselect: () => loadDiscover(true),
});
registerTab({ id: "friends", label: "Friends", view: friendsView });

// Sheets and pages that open in #layer.
registerSheet("game", {
  render: (sh) => gamePage(sh.id),
  onOpen(sh) {
    const g = idx.g[sh.id];
    if (g && g.igdb_id != null) ensureSteam(g.igdb_id);
  },
  // After a reload only the read-only parts update, so a half-filled log form is never wiped.
  refresh(sh) {
    if (!idx.g[sh.id]) return closeSheet();
    const box = $("#others");
    if (box) box.innerHTML = othersReviews(sh.id);
    updatePageChips();
    const sess = $("#sessions");
    const mine = myEntry(sh.id);
    if (sess && mine && mine.status !== "want") sess.innerHTML = sessionsHTML(mine);
  },
});
registerSheet("ext", {
  render: (sh) => extPage(sh),
  onOpen: (sh) => loadExt(sh),
  // The moment the game lands on the shelf, switch to its real page.
  refresh(sh) {
    const g = idx.byIgdb[sh.igdb];
    if (g) {
      S.draft = null;
      openSheet({ kind: "game", id: g.id }, false);
    }
  },
});
registerSheet("add", { render: (sh) => addSheet(sh) });
registerSheet("edit", { render: (sh) => editSheet(sh.id) });
registerSheet("friend", { render: (sh) => friendSheet(sh.id), refresh: () => renderSheet() });
registerSheet("finish", { render: (sh) => finishSheet(sh.id) });
registerSheet("share", { render: (sh) => shareSheet(sh.id) });

// data-act and data-form handlers.
registerActions(shellActions);
registerActions(authActions);
registerActions(shelfActions);
registerActions(discoverActions);
registerActions(friendsActions);
registerActions(gameActions);
registerActions(catalogActions);
registerActions(shareActions);
registerForms(authForms);
registerForms(friendsForms);
registerForms(gameForms);
registerForms(catalogForms);

wireEvents();
start();
registerServiceWorker();
