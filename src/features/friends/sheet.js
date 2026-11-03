// A friend's page: their games grouped by status and your taste match.
import { STATUSES } from "../../core/constants.js";
import { S, idx } from "../../core/state.js";
import { esc, fmtHours, fmtRating, round1 } from "../../core/util.js";
import { friendStats } from "./view.js";
import { taste } from "../picks/picks.js";
import { avatar, gameCover, stars } from "../../ui/cover.js";
import { sheetFrame } from "../../ui/sheet.js";

export function friendSheet(id) {
  const p = idx.p[id];
  if (!p) return "";
  const st = friendStats(id);
  const groups = STATUSES.map((s) => {
    const es = st.es.filter((e) => e.status === s.id && idx.g[e.game_id]).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (!es.length) return "";
    return `<h2 class="section-title" style="margin-top:24px">${s.label} <span class="count">${es.length}</span></h2>
      <div class="grid">${es.map((e) => {
        const g = idx.g[e.game_id];
        return `<button class="tile" data-act="open-game" data-id="${g.id}">${gameCover(g)}
          <div class="tile-title">${esc(g.title)}</div>
          <div class="tile-meta">${e.rating != null ? stars(e.rating, 11) : e.hours ? fmtHours(e.hours) : ""}</div></button>`;
      }).join("")}</div>`;
  }).join("");
  const bits = [`${st.fin} finished`, `${st.es.length} logged`];
  if (st.hours) bits.push(`${Math.round(st.hours)} hours`);
  if (st.avg != null) bits.push(`average rating ${fmtRating(round1(st.avg))}`);
  const t = taste(id);
  let tasteHTML = "";
  if (t) {
    if (t.pct == null) {
      tasteHTML = `<div class="panel taste"><p class="subtle" style="margin:0">Rate ${2 - t.n} more ${2 - t.n === 1 ? "game" : "games"} you've both played to see your taste match.</p></div>`;
    } else {
      const loved = t.pairs.filter((x) => x.me >= 4 && x.them >= 4).map((x) => idx.g[x.gameId]).filter(Boolean);
      const split = t.pairs.slice().sort((a, b) => Math.abs(b.me - b.them) - Math.abs(a.me - a.them))[0];
      const splitGame = split && Math.abs(split.me - split.them) >= 1.5 ? idx.g[split.gameId] : null;
      tasteHTML = `<div class="panel taste">
        <div class="taste-top"><strong>${t.pct}%</strong><span>taste match, from ${t.n} games you've both rated</span></div>
        ${loved.length ? `<p><b>You both loved</b> ${loved.slice(0, 3).map((g) => esc(g.title)).join(", ")}</p>` : ""}
        ${splitGame ? `<p><b>You disagree on</b> ${esc(splitGame.title)} (you ${fmtRating(split.me)}, ${esc(p.display_name)} ${fmtRating(split.them)})</p>` : ""}
      </div>`;
    }
  }
  return sheetFrame("", `
    <div class="friend-head">${avatar(id, "lg")}
      <div><h1>${esc(p.display_name)}</h1>
      <div class="subtle small" style="margin-top:4px">${bits.join(", ")}</div></div></div>
    ${tasteHTML}
    ${groups || `<p class="subtle">${id === S.me ? "You haven't" : esc(p.display_name) + " hasn't"} logged any games yet.</p>`}`, p.display_name);
}
