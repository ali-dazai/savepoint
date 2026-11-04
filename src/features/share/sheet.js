// S27: share your review as an image: the sheet and building the PNG.
import { S, idx, myEntry } from "../../core/state.js";
import { esc } from "../../core/util.js";
import { drawShareCard } from "./card.js";
import { toast } from "../../ui/feedback.js";
import { renderSheet, sheetFrame } from "../../ui/sheet.js";

export function shareSheet(id) {
  const g = idx.g[id];
  const mine = myEntry(id);
  if (!g || !mine || !S.share) return "";
  const sh = S.share;
  const canShare = !!(navigator.canShare && window.File);
  return sheetFrame(
    "Share your review",
    `
    <div class="share-preview">${sh.url ? `<img src="${sh.url}" alt="Preview of your share image for ${esc(g.title)}">` : `<div class="share-wait" role="status">Making your image…</div>`}</div>
    ${mine.review ? `<label class="check"><input type="checkbox" name="share-include" ${sh.include ? "checked" : ""}> <span>Include my review${mine.spoiler ? " (it's marked as a spoiler)" : ""}</span></label>` : ""}
    <button class="btn block" data-act="share-go" ${sh.url ? "" : "disabled"}>${canShare ? "Share image" : "Save image"}</button>
    <p class="subtle small" style="text-align:center">${canShare ? "Send it to your group chat, or save it to Photos from the share menu." : "Saves a PNG you can post anywhere."}</p>`,
  );
}

let shareSeq = 0;
export async function buildShare() {
  const sh = S.share;
  if (!sh) return;
  const seq = ++shareSeq;
  sh.busy = true;
  try {
    const blob = await drawShareCard(sh.gameId, sh.include);
    if (seq !== shareSeq || S.share !== sh) return;
    if (sh.url) URL.revokeObjectURL(sh.url);
    sh.blob = blob;
    sh.url = URL.createObjectURL(blob);
    sh.busy = false;
    if (S.sheet && S.sheet.kind === "share") renderSheet();
  } catch {
    sh.busy = false;
    toast("Couldn't make the image. Try again.");
  }
}
