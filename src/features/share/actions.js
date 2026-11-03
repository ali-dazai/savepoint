// Share actions: open the sheet, share or save the image.
import { S, idx, myEntry } from "../../core/state.js";
import { norm } from "../../core/util.js";
import { syncDraftFromForm } from "../game/log.js";
import { buildShare } from "./sheet.js";
import { toast } from "../../ui/feedback.js";
import { openSheet } from "../../ui/sheet.js";

export const shareActions = {
  "share-open"(el) {
    const id = el.dataset.id;
    const mine = myEntry(id);
    syncDraftFromForm();
    S.share = { gameId: id, include: !!(mine && mine.review && !mine.spoiler), url: null, blob: null, busy: true };
    openSheet({ kind: "share", id }, true);
    buildShare();
  },
  async "share-go"() {
    const sh = S.share;
    if (!sh || !sh.blob) return;
    const g = idx.g[sh.gameId];
    const name = `save-point-${norm(g ? g.title : "review") || "review"}.png`;
    const file = new File([sh.blob], name, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: g ? g.title : "Save Point" });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = sh.url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Image saved");
  },
};
