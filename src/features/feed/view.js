// Feed tab: your current case, who's playing what, picks, and the latest activity.
import { S, idx, nameOf, verbFor } from "../../core/state.js";
import { ago, esc, fmtHours, since, took } from "../../core/util.js";
import { picksFor } from "../picks/picks.js";
import { avatar, gameCover, rowCover, spoilerText, stars, wearOf } from "../../ui/cover.js";
import { emptyState, topbar } from "../../ui/screen.js";

export function feedView() {
  const playing = S.entries
    .filter((e) => e.status === "playing" && idx.g[e.game_id])
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const items = S.entries
    .filter((e) => idx.g[e.game_id])
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 80);

  // Top: your current case, big, with +1 hour. If you're not playing anything, the most recent friend's.
  let top = "";
  const h = playing.find((e) => e.user_id === S.me) || playing[0];
  if (h) {
    const g = idx.g[h.game_id];
    const mineTop = h.user_id === S.me;
    const who = mineTop ? "You're playing" : `${nameOf(h.user_id)} is playing`;
    const sub = [
      h.started_at ? `started ${since(h.started_at)}` : "",
      mineTop && h.updated_at ? `last played ${ago(h.updated_at)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    top = `<section class="now">
      <button class="now-case case-btn" data-act="open-game" data-id="${g.id}"${mineTop ? ' data-hold="1"' : ""} aria-label="${esc(who)} ${esc(g.title)}">${gameCover(g, { wear: wearOf(h.hours || 0) })}</button>
      <div class="now-text">
        <div class="now-who">${mineTop ? "" : avatar(h.user_id, "sm")}${esc(who)}</div>
        <button class="now-title link-btn" data-act="open-game" data-id="${g.id}">${esc(g.title)}</button>
        <div class="now-hours">${h.hours ? fmtHours(h.hours) : "0h"}</div>
        ${sub ? `<div class="now-sub">${esc(sub)}</div>` : ""}
        ${mineTop ? `<button class="btn now-add" data-act="quick-hours" data-id="${g.id}" data-delta="1">+1 hour</button>` : ""}
      </div>
    </section>`;
  }
  // Everyone else's current games, standing on a shelf.
  const rest = playing.filter((e) => e !== h).slice(0, 8);
  if (rest.length) {
    top += `<section class="section"><h2 class="section-title">On everyone's shelf now</h2>
      <div class="mini-shelf"><div class="mini-cases">${rest
        .map((e) => {
          const g2 = idx.g[e.game_id];
          return `<button class="mini" data-act="open-game" data-id="${g2.id}" aria-label="${esc(nameOf(e.user_id))} is playing ${esc(g2.title)}">
          <span class="mini-case">${gameCover(g2, { cls: "sm" })}${avatar(e.user_id, "sm mini-av")}</span>
          <span class="mini-name">${esc(e.user_id === S.me ? "You" : nameOf(e.user_id))}</span></button>`;
        })
        .join("")}</div><div class="ledge thin"></div></div></section>`;
  }

  const isNew = (e) => S.seenAt && e.user_id !== S.me && e.updated_at > S.seenAt;
  const newCount = items.filter(isNew).length;
  let rows = "";
  let dividerDone = false;
  items.forEach((e, i) => {
    if (newCount && !dividerDone && !isNew(e) && i > 0) {
      rows += `<li class="feed-divider" role="separator"><span>Earlier</span></li>`;
      dividerDone = true;
    }
    rows += feedItem(e, isNew(e));
  });
  const list = items.length
    ? `<section class="section"><h2 class="section-title">Latest${newCount ? ` <span class="new-count">${newCount} new</span>` : ""}</h2><ul class="feed">${rows}</ul></section>`
    : emptyState("Nothing logged yet", "Add a game you're playing and it'll show up here for everyone.", "Add a game");

  const picks = picksFor();
  const myRated = S.entries.filter((e) => e.user_id === S.me && e.rating != null).length;
  const picksHTML = picks.length
    ? `<section class="section"><h2 class="section-title">Picked for you</h2><div class="rail">${picks.map(pickCard).join("")}</div></section>`
    : S.entries.some((e) => e.user_id === S.me) && myRated < 2
      ? `<section class="section"><p class="nudge">Rate a couple of games and you'll get picks here, based on your friends' ratings and games like the ones you love.</p></section>`
      : "";

  return topbar("Feed") + top + picksHTML + list;
}

function pickCard(p) {
  if (p.kind === "friend") {
    return `<button class="rail-item" data-act="open-game" data-id="${p.game.id}" aria-label="${esc(p.game.title)}: ${esc(p.reason)}">
      ${gameCover(p.game, { sealed: true })}
      <div class="rail-title">${esc(p.game.title)}</div>
      <div class="rail-why">${esc(p.reason)}</div>
    </button>`;
  }
  const r = p.row;
  return `<button class="rail-item" data-act="open-row" data-igdb="${r.igdb_id}" data-why="${esc(p.reason)}" aria-label="${esc(r.name)}: ${esc(p.reason)}">
    ${rowCover(r, { sealed: true })}
    <div class="rail-title">${esc(r.name)}</div>
    <div class="rail-why">${esc(p.reason)}</div>
  </button>`;
}

function feedItem(e, fresh) {
  const g = idx.g[e.game_id];
  const t = e.status === "finished" ? took(e) : "";
  return `<li class="feed-item${fresh ? " is-new" : ""}">
    <button class="thumb" data-act="open-game" data-id="${g.id}" aria-label="Open ${esc(g.title)}">${gameCover(g, { cls: "sm", sealed: e.status === "want", sticker: e.status === "finished" ? `<span class="stk done">Completed</span>` : "" })}</button>
    <div>
      <div class="what"><b>${esc(nameOf(e.user_id))}</b> ${verbFor(e)} <button class="link-btn" data-act="open-game" data-id="${g.id}">${esc(g.title)}</button></div>
      <div class="when">${e.rating != null ? stars(e.rating, 12) + " " : ""}${ago(e.updated_at)}${e.hours ? ", " + fmtHours(e.hours) + " played" : ""}${t ? ", " + t : ""}</div>
      ${spoilerText(e, "quote")}
    </div>
  </li>`;
}
