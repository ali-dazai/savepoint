// Shared building blocks: game cases, stickers, stars, avatars, the app mark, spoiler text.
import { AVATAR, ICON, IGDB_IMG, STAR_PATH } from "../core/constants.js";
import { S, catOf, catRow, coverUrl, idx, releaseInfo } from "../core/state.js";
import { esc, fmtRating } from "../core/util.js";
import { gameTint, rowTint } from "./theme.js";

// Stickers sit in one spot on the case and say the status at a glance.
export function stickerFor(g, e) {
  if (!e) return "";
  if (e.status === "finished") return `<span class="stk done">Completed</span>`;
  if (e.status === "dropped") return `<span class="stk traded">Traded in</span>`;
  if (e.status === "paused") return `<span class="stk paused">Paused</span>`;
  if (e.status === "want") { const rel = releaseInfo(catOf(g)); if (rel && rel.upcoming) return `<span class="stk">Out ${esc(rel.short)}</span>`; }
  return "";
}
const SCUFFS = [
  "left:3cqw;top:1.5cqw;width:11cqw;transform:rotate(-38deg)", "right:1.5cqw;bottom:7cqw;width:9cqw;transform:rotate(32deg)",
  "right:0.4cqw;top:24cqw;width:6cqw;transform:rotate(82deg)", "left:1cqw;bottom:1.5cqw;width:9cqw;transform:rotate(44deg)",
  "right:22cqw;bottom:0.6cqw;width:8cqw", "left:0.4cqw;top:44cqw;width:6cqw;transform:rotate(90deg)",
];
export function wearOf(hours) { return hours >= 200 ? 3 : hours >= 100 ? 2 : hours >= 50 ? 1 : 0; }

// ---------------- Building blocks ----------------
function starSvg(cls) { return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}" fill="currentColor"/></svg>`; }
export function star(fill) {
  return `<span class="st">${starSvg("st-empty")}<span class="st-fill" style="width:${fill * 100}%">${starSvg("")}</span></span>`;
}
export function stars(rating, size) {
  let out = "";
  for (let i = 1; i <= 5; i++) out += star(rating >= i ? 1 : rating >= i - 0.5 ? 0.5 : 0);
  return `<span class="stars" style="${size ? `--s:${size}px` : ""}" role="img" aria-label="${fmtRating(rating)} out of 5 stars">${out}</span>`;
}
export function avatar(id, cls = "") {
  const p = idx.p[id];
  const col = AVATAR[((p ? p.color : 3) % 8 + 8) % 8];
  const letter = p ? (p.display_name.trim()[0] || "?").toUpperCase() : "?";
  return `<span class="avatar ${cls}" style="--c:${col}" aria-hidden="true">${esc(letter)}</span>`;
}
// A game case: the box art as its cover insert when we have it, otherwise a tinted insert with the title.
function coverHTML({ title, url, tint, cls = "", sticker = "", sealed = false, wear = 0 }) {
  const scuffs = SCUFFS.slice(0, wear * 2).map((st) => `<i class="scuff" style="${st}"></i>`).join("");
  return `<span class="cv ${cls}" style="--t:${tint.tile};--tm:${tint.soft}" aria-hidden="true"><span class="art">${url
    ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span class="cv-t">${esc(title)}</span></span>${sealed ? `<span class="wrap"></span>` : ""}${scuffs}${sticker}</span>`;
}
export function gameCover(g, opts = {}) {
  return coverHTML({ title: g.title, url: coverUrl(g, opts.size || "cover_big"), tint: gameTint(g), cls: opts.cls, sticker: opts.sticker, sealed: opts.sealed, wear: opts.wear });
}
export function rowCover(r, opts = {}) {
  const c = catRow(r.igdb_id);
  const img = r.cover_image_id || (c && c.cover_image_id);
  return coverHTML({ title: r.name, url: img ? IGDB_IMG(img, opts.size || "cover_big") : "", tint: rowTint(r), cls: opts.cls, sealed: opts.sealed, sticker: opts.sticker });
}
export function markHTML() { return `<div class="mark" aria-hidden="true"><i></i><i></i><i>${ICON.star}</i></div>`; }
export function spoilerText(e, cls) {
  if (!e.review) return "";
  if (e.spoiler && e.user_id !== S.me && !S.revealed.has(e.id)) {
    return `<button type="button" class="${cls} spoiler" data-act="reveal" data-id="${e.id}"><span>Contains spoilers. Tap to show.</span></button>`;
  }
  return `<div class="${cls}">${e.spoiler ? '<span class="spoiler-tag">Spoilers</span> ' : ""}${esc(e.review)}</div>`;
}
