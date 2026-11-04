// Discover tab: Trending (Steam's most played, mapped to IGDB) and Calendar (upcoming releases + wishlists).
import { ICON, PLAT_FILTERS, PRECISE_DAY, STATUS_LABEL } from "../../core/constants.js";
import { S, catOf, groupLine, idx, myEntry, nameOf, releaseInfo } from "../../core/state.js";
import { addDays, daysUntil, esc, fmtDay, fmtNum, parseDay, todayISO } from "../../core/util.js";
import { rowCover } from "../../ui/cover.js";
import { topbar } from "../../ui/screen.js";

export function discoverView() {
  const seg = `<div class="seg" role="group" aria-label="Discover">
      <button data-act="disc-view" data-v="trending" aria-pressed="${S.discView === "trending"}">Trending</button>
      <button data-act="disc-view" data-v="calendar" aria-pressed="${S.discView === "calendar"}">Calendar</button>
    </div>`;
  const d = S.disc && S.disc.data;
  let body;
  if (!S.api.catalogDiscover)
    body = `<p class="nudge">Discover needs the games database, which this copy isn't connected to.</p>`;
  else if (S.discView === "calendar") body = calendarHTML(d);
  else if (d) body = trendingHTML(d);
  else if (S.disc && S.disc.error) body = discError();
  else body = skeleton();
  return (
    topbar("Discover", false) +
    seg +
    body +
    `<p class="credit">Game data from IGDB. Player counts and review scores from Steam.</p>`
  );
}
function discError() {
  return `<div class="empty"><h3>Can't load Discover</h3><p>${esc(S.disc.error)}</p><button class="btn secondary" data-act="disc-retry">Try again</button></div>`;
}
function skeleton() {
  return `<div role="status" aria-label="Loading">${Array.from({ length: 6 }, () => `<div class="skel"><i></i><i></i><i></i></div>`).join("")}</div>`;
}
function wantButton(igdbId, name) {
  const shelf = idx.byIgdb[igdbId];
  const mine = shelf && myEntry(shelf.id);
  if (mine)
    return `<button class="want-btn" data-act="open-row" data-igdb="${igdbId}" aria-pressed="true" aria-label="${esc(name)} is on your shelf (${esc(STATUS_LABEL[mine.status])})">${ICON.check}</button>`;
  return `<button class="want-btn" data-act="quick-want" data-igdb="${igdbId}" aria-pressed="false" aria-label="Add ${esc(name)} to Want to play">${ICON.plus}</button>`;
}
function trendingHTML(d) {
  const items = d.trending || [];
  const note =
    "Steam's most played right now: new arrivals and fast climbers first. Tap + to put a sealed copy on your shelf.";
  if (!items.length) return `<p class="nudge">Nothing to show yet. Check back later.</p>`;
  return `<p class="disc-note">${note}</p><ol class="trend">${items
    .map((r, i) => {
      const shelf = idx.byIgdb[r.igdb_id];
      const line = shelf ? groupLine(shelf.id) : "";
      const meta = r.peak
        ? [`${fmtNum(r.peak)} peak players`, r.steam_pct != null ? `${r.steam_pct}% positive` : ""]
            .filter(Boolean)
            .join(", ")
        : [r.year, (r.platforms || []).slice(0, 3).join(", ")].filter(Boolean).join(", ");
      const hot = r.hot != null ? r.hot : /^\+/.test(r.reason || "");
      const reason = String(r.reason || "").replace(/^(New in Steam's top 100) this week$/, "$1");
      return `<li><span class="rank">${i + 1}</span>
      <button class="open" data-act="open-row" data-igdb="${r.igdb_id}">${rowCover(r, { sealed: !(shelf && myEntry(shelf.id)) })}<span class="t-text"><b>${esc(r.name)}</b>
        <span class="t-meta">${esc(meta)}</span><span class="reason${hot ? " hot" : ""}">${esc(reason)}</span>${line ? `<span class="t-status">${esc(line)}</span>` : ""}</span></button>
      ${wantButton(r.igdb_id, r.name)}</li>`;
    })
    .join("")}</ol>`;
}

export function platKinds(list) {
  const k = new Set();
  (list || []).forEach((p) => {
    const s = String(p);
    if (/^(PC|Mac|Linux|Win)/i.test(s)) k.add("pc");
    else if (/^(PS|PlayStation)/i.test(s)) k.add("ps");
    else if (/(XSX|XONE|X360|Xbox|Series)/i.test(s)) k.add("xbox");
    else if (/(Switch|NSW|NS2)/i.test(s)) k.add("switch");
  });
  return k;
}

// Everything coming out: wishlist games on the shelf (yours and friends'), plus the big upcoming releases.
export function calendarItems(d) {
  const map = new Map();
  S.games.forEach((g) => {
    const c = catOf(g);
    if (!c) return;
    const wants = (idx.byGame[g.id] || []).filter((e) => e.status === "want");
    if (!wants.length) return;
    const rel = releaseInfo(c);
    if (!rel || !rel.upcoming) return;
    map.set(c.igdb_id, {
      igdb_id: c.igdb_id,
      name: g.title,
      cover_image_id: c.cover_image_id,
      platforms: c.platforms || [],
      date: rel.date,
      human: rel.short,
      mine: wants.some((e) => e.user_id === S.me),
      wanters: wants.filter((e) => e.user_id !== S.me).map((e) => e.user_id),
    });
  });
  ((d && d.upcoming) || []).forEach((u) => {
    const precise = !!u.date && (!u.human || PRECISE_DAY.test(u.human));
    const ex = map.get(u.igdb_id);
    if (ex) {
      if (!ex.date && precise) {
        ex.date = u.date;
        ex.human = fmtDay(u.date);
      }
      return;
    }
    map.set(u.igdb_id, {
      ...u,
      date: precise ? u.date : null,
      human: precise ? fmtDay(u.date) : u.human || "TBA",
      mine: false,
      wanters: [],
      big: true,
    });
  });
  const today = todayISO();
  return [...map.values()].filter((it) => !it.date || it.date >= today);
}

function calendarHTML(d) {
  const today = todayISO();
  const all = calendarItems(d);
  const listed = (it) => it.mine || it.wanters.length;
  const items = all.filter((it) => S.plat === "all" || listed(it) || platKinds(it.platforms).has(S.plat));
  const mine = all.filter((it) => it.mine);
  const nextMine = mine.filter((it) => it.date).sort((a, b) => a.date.localeCompare(b.date))[0];

  let summary;
  if (mine.length) {
    const n = daysUntil(nextMine ? nextMine.date : today);
    summary =
      `<b>${mine.length} ${mine.length === 1 ? "game" : "games"}</b> on your Want to play list ${mine.length === 1 ? "isn't" : "aren't"} out yet.` +
      (nextMine
        ? ` Next up: <b>${esc(nextMine.name)}</b>, ${esc(fmtDay(nextMine.date))} (${n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`}).`
        : "");
  } else {
    summary =
      "Games on your Want to play list show up here with their release dates. Tap + on anything coming up to add it.";
  }
  const filters = `<div class="chips" role="group" aria-label="Platform">${PLAT_FILTERS.map(
    (p) =>
      `<button class="chip" data-act="plat" data-p="${p.id}" aria-pressed="${S.plat === p.id}">${p.label}</button>`,
  ).join("")}</div>`;

  const dated = items
    .filter((it) => it.date)
    .sort((a, b) => a.date.localeCompare(b.date) || (listed(b) ? 1 : 0) - (listed(a) ? 1 : 0));
  const later = items
    .filter((it) => !it.date)
    .sort((a, b) => (listed(b) ? 1 : 0) - (listed(a) ? 1 : 0) || String(a.human).localeCompare(String(b.human)));
  const weekEnd = addDays(today, 6);
  const groups = [];
  const push = (key, label, it) => {
    let gr = groups.find((x) => x.key === key);
    if (!gr) groups.push((gr = { key, label, items: [] }));
    gr.items.push(it);
  };
  dated.forEach((it) => {
    if (it.date <= weekEnd) return push("week", "This week", it);
    const dt = parseDay(it.date);
    const label = dt.toLocaleDateString(undefined, {
      month: "long",
      year: dt.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });
    push(it.date.slice(0, 7), label, it);
  });
  if (later.length) groups.push({ key: "later", label: "Later, or no date yet", items: later });

  const loadingBig = !d && !(S.disc && S.disc.error);
  const body = groups.length
    ? groups
        .map(
          (gr) =>
            `<section class="cal-group"><h3>${esc(gr.label)}</h3><ul class="cal-list">${gr.items.map(calRow).join("")}</ul></section>`,
        )
        .join("")
    : loadingBig
      ? ""
      : `<p class="nudge">No releases match this filter.</p>`;
  return `<div class="cal-summary">${summary}</div>${filters}${body}${loadingBig ? skeleton() : ""}${S.disc && S.disc.error && !d ? discError() : ""}`;
}

function calRow(it) {
  const plats = (it.platforms || []).slice(0, 4).join(", ");
  let day;
  if (it.date) {
    const dt = parseDay(it.date);
    day = `<span class="day"><b>${dt.getDate()}</b><span>${esc(dt.toLocaleDateString(undefined, { weekday: "short" }))}</span></span>`;
  } else day = `<span class="day when">${esc(it.human || "TBA")}</span>`;
  let flag = "";
  if (it.mine) flag = `<span class="flag">On your list</span>`;
  else if (it.wanters.length) {
    const names = it.wanters.map(nameOf);
    flag = `<span class="flag friend">${esc(names.slice(0, 2).join(" and "))}${names.length > 2 ? " and others" : ""} ${names.length === 1 ? "wants" : "want"} it</span>`;
  }
  return `<li class="${it.mine ? "mine" : ""}">${day}
    <button class="open" data-act="open-row" data-igdb="${it.igdb_id}">${rowCover(it, { cls: "sm", sealed: true })}<span class="t-text"><b>${esc(it.name)}</b>
      ${plats ? `<span class="t-meta">${esc(plats)}</span>` : ""}${flag}</span></button>
    ${wantButton(it.igdb_id, it.name)}</li>`;
}
