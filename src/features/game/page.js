// The game page: opened case header with score chips, your log form, about, friends' logs, actions.
import { ICON, SESSION_STEPS, STATUSES, STATUS_LABEL } from "../../core/constants.js";
import { S, catOf, catRow, coverUrl, groupScore, idx, myEntry, nameOf, releaseInfo } from "../../core/state.js";
import { $, ago, dateInput, daysUntil, esc, fmtHours, fmtNum, fmtRating, round1, took } from "../../core/util.js";
import { pickReason } from "../picks/picks.js";
import { avatar, spoilerText, star, stars } from "../../ui/cover.js";
import { pageFrame, pageHead } from "../../ui/sheet.js";
import { gameHueSat, gameTint } from "../../ui/theme.js";

// Score chips on a game page: friends, critics, Steam, release date.
export function scoreChips(c, sc) {
  const chip = (big, label) => `<div class="score-chip"><b>${esc(big)}</b><span>${esc(label)}</span></div>`;
  const out = [];
  if (sc) out.push(chip(fmtRating(round1(sc.avg)), sc.n === 1 ? "1 friend" : `${sc.n} friends`));
  if (c && c.critic_score != null) out.push(chip(String(Math.round(c.critic_score)), "Critics"));
  if (c && c.steam_pct != null && c.steam_total)
    out.push(chip(c.steam_pct + "%", "Steam" + (c.steam_desc ? ", " + c.steam_desc : "")));
  else if (c && S.steamLoading.has(c.igdb_id))
    out.push(`<div class="score-chip pending" role="status"><b>…</b><span>Steam</span></div>`);
  const rel = releaseInfo(c);
  if (rel && rel.upcoming)
    out.push(
      chip(
        rel.short,
        rel.precise && daysUntil(rel.date) <= 60
          ? `Out in ${daysUntil(rel.date)} ${daysUntil(rel.date) === 1 ? "day" : "days"}`
          : "Release",
      ),
    );
  let html = out.length ? `<div class="scores">${out.join("")}</div>` : "";
  if (c && c.steam_players > 0) html += `<p class="players">${fmtNum(c.steam_players)} playing on Steam right now</p>`;
  return html;
}
export function updatePageChips() {
  const box = $("#chips");
  if (!box || !S.sheet) return;
  if (S.sheet.kind === "game") box.innerHTML = scoreChips(catOf(idx.g[S.sheet.id]), groupScore(S.sheet.id));
  else if (S.sheet.kind === "ext") box.innerHTML = scoreChips(catRow(S.sheet.igdb), null);
}
// Outside links are rendered only when they look like what we expect (an https IGDB page, a numeric Steam app id),
// so a bad or tampered catalogue row can never put a javascript: or data: URL into the page.
function igdbLink(c) {
  return /^https:\/\/(www\.)?igdb\.com\//i.test(c.igdb_url || "")
    ? `. <a href="${esc(c.igdb_url)}" target="_blank" rel="noopener">View on IGDB</a>`
    : "";
}
function steamLink(c) {
  return /^\d{1,10}$/.test(String(c.steam_appid || ""))
    ? `. <a href="https://store.steampowered.com/app/${c.steam_appid}" target="_blank" rel="noopener">Steam page</a>`
    : "";
}
export function aboutHTML(c) {
  if (!c) return "";
  return `<section class="about">
    ${
      c.genres && c.genres.length
        ? `<div class="genres">${c.genres
            .slice(0, 4)
            .map((x) => `<span>${esc(x)}</span>`)
            .join("")}</div>`
        : ""
    }
    ${c.summary ? `<p class="summary" id="summary">${esc(c.summary)}</p><button type="button" class="btn ghost more" data-act="more">More</button>` : ""}
    <p class="credit">Game data from IGDB${igdbLink(c)}${steamLink(c)}</p>
  </section>`;
}
export function sessionsHTML(mine) {
  return `<div class="sessions"><span>Log a session</span>${SESSION_STEPS.map(
    (h) =>
      `<button type="button" class="chip" data-act="quick-hours" data-id="${mine.game_id}" data-delta="${h}">+${h < 1 ? "30m" : h + "h"}</button>`,
  ).join("")}
    <span class="total">${mine.hours ? fmtHours(mine.hours) + " total" : ""}</span></div>`;
}

export function gamePage(id) {
  const g = idx.g[id];
  if (!g) return "";
  const mine = myEntry(id);
  if (!S.draft || S.draft.gameId !== id) {
    S.draft = {
      gameId: id,
      status: mine ? mine.status : "playing",
      rating: mine ? mine.rating : null,
      hours: mine ? mine.hours : null,
      review: mine ? mine.review || "" : "",
      spoiler: mine ? !!mine.spoiler : false,
      started_at: mine ? mine.started_at || null : null,
      finished_at: mine ? mine.finished_at || null : null,
      prevStatus: mine ? mine.status : null,
    };
  }
  const d = S.draft;
  const c = catOf(g);
  const year = g.year || (c && c.first_release_date ? c.first_release_date.slice(0, 4) : "");
  const plats = g.platform || (c && c.platforms ? c.platforms.slice(0, 3).join(", ") : "");
  const meta = [year, c && c.genres && c.genres[0], plats].filter(Boolean).join(", ");
  const canShare = mine && (mine.rating != null || mine.review || mine.status === "finished");
  const head = pageHead({
    title: g.title,
    art: { url: coverUrl(g, "cover_big_2x"), tint: gameTint(g), title: g.title },
    meta,
    chips: scoreChips(c, groupScore(id)),
    right: canShare
      ? `<button class="btn round glass" data-act="share-open" data-id="${id}" aria-label="Share my review">${ICON.share}</button>`
      : "",
  });
  const showDates = d.started_at || d.finished_at || (mine && mine.status !== "want");
  const body = `
    ${!mine && pickReason(id) ? `<p class="why">Picked for you: ${esc(pickReason(id))}</p>` : ""}
    <section class="card">
      <form data-form="entry" data-id="${id}">
        <div class="card-head"><h2>${mine ? "Your log" : "Log it"}</h2>${mine ? `<span class="subtle small">Updated ${esc(ago(mine.updated_at))}</span>` : ""}</div>
        <div class="status-pick" role="group" aria-label="Status">
          ${STATUSES.map((s) => `<button type="button" data-act="pick-status" data-status="${s.id}" aria-pressed="${d.status === s.id}">${s.label}</button>`).join("")}
        </div>
        ${mine && mine.status !== "want" ? `<div id="sessions">${sessionsHTML(mine)}</div>` : ""}
        <div class="field"><span>Your rating</span>
          <div class="star-input" role="group" aria-label="Rating">${starInput(d.rating)}
            ${d.rating != null ? `<button type="button" class="btn ghost clear" data-act="clear-rating">Clear</button>` : ""}</div>
          <div class="rating-readout">${d.rating != null ? `${fmtRating(d.rating)} out of 5` : "Tap a star. Tap its left half for a half star."}</div>
        </div>
        <label class="field"><span>Hours played</span><input class="input" name="hours" type="number" inputmode="decimal" min="0" step="0.5" value="${d.hours == null ? "" : d.hours}" placeholder="Optional"></label>
        <label class="field"><span>Review</span><textarea class="input" name="review" maxlength="5000" placeholder="What did you think? Optional.">${esc(d.review)}</textarea></label>
        <label class="check"><input type="checkbox" name="spoiler" ${d.spoiler ? "checked" : ""}> <span>Contains spoilers. Friends tap to read it.</span></label>
        ${
          showDates
            ? `<div class="row">
          <label class="field"><span>Started</span><input class="input" type="date" name="started_at" value="${dateInput(d.started_at)}"></label>
          <label class="field"><span>Finished</span><input class="input" type="date" name="finished_at" value="${dateInput(d.finished_at)}"></label>
        </div>`
            : ""
        }
        <p class="error" role="alert"></p>
        <button class="btn block" type="submit">${mine ? "Save changes" : "Add to my shelf"}</button>
      </form>
    </section>
    ${aboutHTML(c)}
    <section><h2 class="section-title">Friends</h2><div id="others">${othersReviews(id)}</div></section>
    <div class="page-actions">
      ${canShare ? `<button type="button" class="btn secondary block" data-act="share-open" data-id="${id}">Share my review as an image</button>` : ""}
      <div class="row">
        <button class="btn secondary" data-act="edit-game" data-id="${id}">Edit details</button>
        ${g.added_by === S.me ? `<button class="btn secondary" style="color:var(--danger)" data-act="delete-game" data-id="${id}">Delete game</button>` : ""}
      </div>
      ${mine ? `<button type="button" class="btn danger block" data-act="remove-entry" data-id="${mine.id}">Remove from my shelf</button>` : ""}
    </div>`;
  return pageFrame(g.title, head, body, { tint: gameTint(g), hs: gameHueSat(g) });
}

export function starInput(r) {
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const fill = r == null ? 0 : r >= i ? 1 : r >= i - 0.5 ? 0.5 : 0;
    out += `<button type="button" class="star-btn" data-act="rate" data-n="${i}" aria-label="${i} star${i > 1 ? "s" : ""}">${star(fill)}</button>`;
  }
  return out;
}

export function othersReviews(id) {
  const others = (idx.byGame[id] || [])
    .filter((e) => e.user_id !== S.me)
    .sort((a, b) => (b.review ? 1 : 0) - (a.review ? 1 : 0) || b.updated_at.localeCompare(a.updated_at));
  if (!others.length) return `<p class="subtle" style="margin:0">None of your friends have logged this yet.</p>`;
  return others
    .map((e) => {
      const bits = [STATUS_LABEL[e.status].toLowerCase() + (e.status === "finished" && took(e) ? ` ${took(e)}` : "")];
      if (e.hours) bits.push(fmtHours(e.hours));
      bits.push(ago(e.updated_at));
      return `<article class="review">${avatar(e.user_id)}
      <div class="review-body"><span class="who">${esc(nameOf(e.user_id))}</span> <span class="meta">${esc(bits.join(", "))}</span>
        ${e.rating != null ? `<div>${stars(e.rating, 13)}</div>` : ""}
        ${spoilerText(e, "review-text")}
      </div></article>`;
    })
    .join("");
}
