// S31: the Add sheet: catalogue search (IGDB via the server), pick, platform, status; or add by hand. Also links existing games.
import { ICON, PLATFORMS, STATUSES } from "../../core/constants.js";
import { S, idx } from "../../core/state.js";
import { $, esc } from "../../core/util.js";
import { rowCover } from "../../ui/cover.js";
import { sheetFrame } from "../../ui/sheet.js";

export function addSheet(sh) {
  if (sh.mode !== "manual") return catalogSheet(sh);
  return sheetFrame(
    "Add it by hand",
    `
    <button type="button" class="btn ghost backlink" data-act="cat-back">${ICON.back}<span>Back to search</span></button>
    <form data-form="add" novalidate>
      <label class="field"><span>Title</span><input class="input" name="title" maxlength="120" required autofocus autocomplete="off" value="${esc(sh.title || "")}"></label>
      <div id="dupe"></div>
      <div class="row">
        <label class="field"><span>Platform</span><input class="input" name="platform" list="platforms" maxlength="40" placeholder="Optional"></label>
        <label class="field" style="flex:0.6"><span>Year</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="2100" placeholder="Optional"></label>
      </div>
      <datalist id="platforms">${PLATFORMS.map((p) => `<option value="${p}">`).join("")}</datalist>
      <label class="field"><span>Cover image link</span><input class="input" name="cover_url" type="url" inputmode="url" autocapitalize="off" placeholder="https://… (optional)"><small>Paste a link to box art. Leave it blank and the game gets a plain tile with its name.</small></label>
      <div class="field"><span>Your status</span>
        <div class="status-pick" role="group" aria-label="Your status">
          ${[...STATUSES, { id: "none", label: "Just add it" }].map((s) => `<button type="button" data-act="pick-add-status" data-status="${s.id}" aria-pressed="${(sh.status || "playing") === s.id}">${s.label}</button>`).join("")}
        </div></div>
      <p class="error" role="alert"></p>
      <button class="btn block" type="submit">Add to shelf</button>
    </form>`,
  );
}

// S31: search the games database (also used to link an existing game: sh.linkId)
function catalogSheet(sh) {
  const linking = !!sh.linkId;
  const st = S.cat || {};
  const picked = st.picked;
  let body;
  if (picked) {
    const onShelf = idx.byIgdb[picked.igdb_id];
    body = `<button type="button" class="btn ghost backlink" data-act="cat-unpick">${ICON.back}<span>Back to results</span></button>
      <div class="picked">
        ${rowCover(picked)}
        <div><h3>${esc(picked.name)}</h3><div class="subtle small">${[picked.year, (picked.platforms || []).slice(0, 5).join(", ")].filter(Boolean).map(esc).join("<br>")}</div></div>
      </div>
      ${
        onShelf && onShelf.id !== sh.linkId
          ? `<div class="suggest">${esc(onShelf.title)} is already on the shelf. <button type="button" data-act="open-game" data-id="${onShelf.id}">Open it</button></div>`
          : linking
            ? `
      <p class="subtle">Link <b>${esc(idx.g[sh.linkId] ? idx.g[sh.linkId].title : "this game")}</b> to this entry? It gets this cover art, genres, critic score and Steam reviews. Everyone's logs stay as they are.</p>
      <p class="error" role="alert"></p>
      <button class="btn block" data-act="cat-link">Link game</button>`
            : `
      ${
        (picked.platforms || []).length
          ? `<div class="field"><span>Which platform do you play on?</span>
        <div class="chips wrap" role="group" aria-label="Platform">${picked.platforms
          .slice(0, 10)
          .map(
            (pf) =>
              `<button type="button" class="chip" data-act="cat-platform" data-p="${esc(pf)}" aria-pressed="${st.platform === pf}">${esc(pf)}</button>`,
          )
          .join("")}</div></div>`
          : ""
      }
      <div class="field"><span>Your status</span>
        <div class="status-pick" role="group" aria-label="Your status">
          ${[...STATUSES, { id: "none", label: "Just add it" }].map((x) => `<button type="button" data-act="pick-add-status" data-status="${x.id}" aria-pressed="${(sh.status || "playing") === x.id}">${x.label}</button>`).join("")}
        </div></div>
      <p class="error" role="alert"></p>
      <button class="btn block" data-act="cat-add">Add to shelf</button>`
      }`;
  } else {
    body = `<label class="search"><span class="sr-only">Search the games database</span>${ICON.search}<input class="input" name="cat-q" type="search" placeholder="Search for a game" value="${esc(st.q || "")}" autofocus autocomplete="off" autocorrect="off" enterkeyhint="search"></label>
      <div id="cat-results">${catalogResultsHTML(sh)}</div>
      ${linking ? "" : `<p class="manual"><button type="button" class="btn ghost" data-act="cat-manual">Can't find it? Add it by hand</button></p>`}
      <p class="credit">Game data from IGDB</p>`;
  }
  return sheetFrame(linking ? "Link to the games database" : "Add a game", body).replace(
    'class="sheet"',
    'class="sheet tall"',
  );
}
function catalogResultsHTML(sh) {
  const st = S.cat || {};
  if (st.error) return `<div class="cat-msg" role="alert">${esc(st.error)}</div>`;
  if (st.loading && !(st.results || []).length) return `<div class="cat-msg" role="status">Searching…</div>`;
  if (!st.q || st.q.trim().length < 2) return `<div class="cat-msg">Type at least two letters of the title.</div>`;
  if (!(st.results || []).length) return `<div class="cat-msg">No matches for "${esc(st.q)}".</div>`;
  return `<ul class="cat-list${st.loading ? " is-loading" : ""}">${st.results
    .map((r) => {
      const onShelf = idx.byIgdb[r.igdb_id];
      return `<li><button type="button" data-act="cat-pick" data-igdb="${r.igdb_id}">
      ${rowCover(r, { size: "cover_small" })}
      <span class="cat-text"><b>${esc(r.name)}</b><span>${[r.year, (r.platforms || []).slice(0, 4).join(", ")].filter(Boolean).map(esc).join(" · ")}</span></span>
      ${onShelf && onShelf.id !== (sh && sh.linkId) ? `<span class="on-shelf">On the shelf</span>` : ""}
    </button></li>`;
    })
    .join("")}</ul>`;
}

// S21: the "Finished!" moment
// S31: catalogue search (debounced, latest query wins)
let catTimer = null,
  catSeq = 0;
export function runCatalogSearch(q) {
  if (!S.cat) return;
  S.cat.q = q;
  S.cat.error = null;
  clearTimeout(catTimer);
  const box = () => $("#cat-results");
  if (q.trim().length < 2) {
    S.cat.results = [];
    S.cat.loading = false;
    if (box()) box().innerHTML = catalogResultsHTML(S.sheet);
    return;
  }
  S.cat.loading = true;
  if (box()) box().innerHTML = catalogResultsHTML(S.sheet);
  catTimer = setTimeout(async () => {
    const mySeq = ++catSeq;
    try {
      const results = await S.api.catalogSearch(q);
      if (mySeq !== catSeq || !S.cat) return;
      S.cat.results = results;
      S.cat.loading = false;
    } catch (e) {
      if (mySeq !== catSeq || !S.cat) return;
      S.cat.results = [];
      S.cat.loading = false;
      S.cat.error = e.message;
    }
    if (box()) box().innerHTML = catalogResultsHTML(S.sheet);
  }, 350);
}
