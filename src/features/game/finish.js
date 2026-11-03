// S21: the "You finished it" moment: disc back in the case, Completed sticker, rating and one-liner.
import { S, coverUrl, idx, myEntry } from "../../core/state.js";
import { esc, fmtHours, fmtRating, took } from "../../core/util.js";
import { starInput } from "./page.js";
import { sheetFrame } from "../../ui/sheet.js";
import { gameTint } from "../../ui/theme.js";

// The finish moment: the disc drops back into its case, the case shuts, the Completed sticker slaps on.
function finishStage(g, play) {
  const url = coverUrl(g, "cover_big");
  const t = gameTint(g);
  const img = url ? `<img src="${esc(url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const name = `<span class="cv-t">${esc(g.title)}</span>`;
  return `<div class="finish-stage${play ? " play" : ""}" aria-hidden="true" style="--t:${t.tile};--tm:${t.soft}">
    <div class="fs-case">
      <div class="fs-tray"></div>
      <div class="disc fs-disc"><div class="label">${img || name}</div><span class="hub"></span></div>
      <div class="fs-lid"><div class="face back"></div><div class="face front"><div class="ins">${img || name}</div></div></div>
      <span class="stk done">Completed</span>
    </div>
  </div>`;
}
export function finishSheet(id) {
  const g = idx.g[id];
  const mine = myEntry(id);
  if (!g || !mine) return "";
  if (!S.draft || S.draft.gameId !== id) S.draft = { gameId: id, rating: mine.rating, review: mine.review || "", spoiler: !!mine.spoiler };
  const d = S.draft;
  const t = took(mine);
  const play = S.sheet && !S.sheet.opened;
  if (S.sheet) S.sheet.opened = true;
  return sheetFrame("", `
    <div class="finish-hero${play ? " play" : ""}">${finishStage(g, play)}
      <h1>Back in its case.</h1>
      <p class="subtle">You finished ${esc(g.title)}${[t ? " " + t : "", mine.hours ? ", " + fmtHours(mine.hours) + " played" : ""].join("")}. How was it?</p>
    </div>
    <form data-form="finish" data-id="${id}" class="finish-form${play ? " play" : ""}">
      <div class="field"><span>Your rating</span>
        <div class="star-input" role="group" aria-label="Rating">${starInput(d.rating)}</div>
        <div class="rating-readout">${d.rating != null ? `${fmtRating(d.rating)} out of 5` : "Tap a star. Tap its left half for a half star."}</div>
      </div>
      <label class="field"><span>One line for your friends</span><input class="input" name="review" maxlength="280" value="${esc(d.review)}" placeholder="e.g. Best ending I've played in years"></label>
      <label class="check"><input type="checkbox" name="spoiler" ${d.spoiler ? "checked" : ""}> <span>Contains spoilers</span></label>
      <p class="error" role="alert"></p>
      <div class="row"><button type="button" class="btn secondary" data-act="open-game" data-id="${id}">Not now</button><button class="btn" type="submit">Save</button></div>
    </form>`, `You finished ${g.title}`);
}
