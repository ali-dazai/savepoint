// Shelf tab: the wall of cases, scope/status/search/sort controls, ledge labels.
import { ICON, STATUSES, STATUS_LABEL } from "../../core/constants.js";
import { S, catOf, groupScore, idx, lastActivity, myEntry, releaseInfo } from "../../core/state.js";
import { esc, fmtHours, fmtRating, norm, round1 } from "../../core/util.js";
import { gameCover, stickerFor, wearOf } from "../../ui/cover.js";
import { emptyState, topbar } from "../../ui/screen.js";

function shelfGames() {
  const mine = S.scope === "mine";
  let games = S.games.slice();
  const counts = { all: 0 };
  if (mine) {
    games = games.filter((g) => myEntry(g.id));
    counts.all = games.length;
    STATUSES.forEach((s) => (counts[s.id] = games.filter((g) => myEntry(g.id).status === s.id).length));
    if (S.status !== "all") games = games.filter((g) => myEntry(g.id).status === S.status);
  }
  const q = norm(S.search);
  if (q) games = games.filter((g) => norm(g.title + (g.platform || "")).includes(q));
  if (S.sort === "rated") {
    games.sort((a, b) => ((groupScore(b.id) || { avg: -1 }).avg - (groupScore(a.id) || { avg: -1 }).avg) || a.title.localeCompare(b.title));
  } else if (S.sort === "az") {
    games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  } else {
    games.sort((a, b) => lastActivity(b.id) - lastActivity(a.id));
  }
  return { games, counts, mine, q };
}

export function shelfResults() {
  const { games, mine, q } = shelfGames();
  let grid;
  if (!S.games.length) grid = emptyState("The shelf is empty", "Add the first game you're playing or want to play.", "Add a game");
  else if (!games.length && q) grid = `<div class="empty"><h3>No games match "${esc(S.search)}"</h3><p>Check the spelling, or add it to the shelf.</p><button class="btn" data-act="add-game" data-title="${esc(S.search)}">Add ${esc(S.search)}</button></div>`;
  else if (!games.length && mine && S.status !== "all") grid = `<div class="empty"><h3>Nothing marked ${esc(STATUS_LABEL[S.status].toLowerCase())}</h3><p>Open a game and set its status to see it here.</p></div>`;
  else if (!games.length && mine) grid = emptyState("Your shelf is empty", "Log a game from Everyone's shelf, or add a new one.", "Add a game");
  else {
    const cols = window.innerWidth >= 560 ? 4 : 3;
    let rows = "";
    for (let i = 0; i < games.length; i += cols) {
      const row = games.slice(i, i + cols);
      rows += `<div class="shelf-row"><div class="cases">${row.map((g) => caseTile(g)).join("")}</div>
        <div class="ledge"><div class="labels">${row.map((g) => caseLabel(g, mine)).join("")}</div></div></div>`;
    }
    grid = `<div class="wall" style="--cols:${cols}">${rows}</div>`;
  }
  return `<div class="toolbar"><span class="subtle small">${games.length} ${games.length === 1 ? "game" : "games"}</span>
      <label><span class="sr-only">Sort by</span><select class="sort" name="sort">
        <option value="recent" ${S.sort === "recent" ? "selected" : ""}>Recently active</option>
        <option value="rated" ${S.sort === "rated" ? "selected" : ""}>Highest rated</option>
        <option value="az" ${S.sort === "az" ? "selected" : ""}>A to Z</option>
      </select></label>
    </div>${grid}`;
}

export function shelfView() {
  const { counts, mine } = shelfGames();
  const chips = mine
    ? `<div class="chips" role="group" aria-label="Filter by status">
        ${[{ id: "all", label: "All" }, ...STATUSES].map((s) => `<button class="chip" data-act="status-filter" data-status="${s.id}" aria-pressed="${S.status === s.id}">${s.label}<b>${counts[s.id] || 0}</b></button>`).join("")}
      </div>`
    : "";
  const canHold = mine && S.entries.some((e) => e.user_id === S.me && e.status === "playing");
  return topbar("Shelf") + `
    ${canHold ? `<p class="hint">Hold a case to add an hour.</p>` : ""}
    <div class="seg" role="group" aria-label="Whose games">
      <button data-act="scope" data-scope="mine" aria-pressed="${mine}">My games</button>
      <button data-act="scope" data-scope="all" aria-pressed="${!mine}">Everyone's</button>
    </div>
    <label class="search"><span class="sr-only">Search games</span>${ICON.search}<input class="input" name="q" type="search" placeholder="Search games" value="${esc(S.search)}" autocomplete="off" enterkeyhint="search"></label>
    ${chips}
    <div id="shelf-results">${shelfResults()}</div>`;
}

// A case on the wall. Playing games stand forward; hold any logged case (not sealed) to add an hour.
function caseTile(g) {
  const me = myEntry(g.id);
  const out = me && me.status === "playing";
  const canHold = me && me.status !== "want";
  const label = [g.title, me && STATUS_LABEL[me.status], me && me.hours ? fmtHours(me.hours) : ""].filter(Boolean).join(", ");
  return `<button class="case-btn${out ? " out" : ""}" data-act="open-game" data-id="${g.id}"${canHold ? ' data-hold="1"' : ""} aria-label="${esc(label)}">
    ${gameCover(g, { sticker: stickerFor(g, me), sealed: !!me && me.status === "want", wear: me ? wearOf(me.hours || 0) : 0 })}</button>`;
}
// The shelf-edge label under each case: title, then hours and rating (mine) or the group's score (everyone's).
function caseLabel(g, mine) {
  const me = myEntry(g.id);
  let line;
  if (mine && me) {
    if (me.status === "want") { const rel = releaseInfo(catOf(g)); line = `<b>Sealed</b>${rel && rel.upcoming ? esc(rel.short) : ""}`; }
    else line = `<b>${me.hours ? fmtHours(me.hours) : "0h"}</b>${me.rating != null ? fmtRating(me.rating) + " stars" : esc(STATUS_LABEL[me.status])}`;
  } else {
    const sc = groupScore(g.id);
    const n = (idx.byGame[g.id] || []).length;
    line = sc ? `<b>${fmtRating(round1(sc.avg))}</b>${sc.n} rated` : `${n} logged`;
  }
  return `<div class="lbl"><span class="t">${esc(g.title)}</span>${line}</div>`;
}
