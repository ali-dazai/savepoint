// Friends tab: one card per member, your profile, invite link, sign out.
import { AVATAR } from "../../core/constants.js";
import { S, idx } from "../../core/state.js";
import { esc } from "../../core/util.js";
import { taste } from "../picks/picks.js";
import { avatar, gameCover } from "../../ui/cover.js";
import { topbar } from "../../ui/screen.js";

export function friendStats(id) {
  const es = S.entries.filter((e) => e.user_id === id);
  const fin = es.filter((e) => e.status === "finished").length;
  const playing = es.filter((e) => e.status === "playing").length;
  const hours = es.reduce((a, e) => a + (e.hours || 0), 0);
  const rated = es.filter((e) => e.rating != null);
  const avg = rated.length ? rated.reduce((a, e) => a + e.rating, 0) / rated.length : null;
  return { es, fin, playing, hours, avg, reviews: es.filter((e) => e.review).length };
}

export function friendsView() {
  const people = S.profiles
    .slice()
    .sort((a, b) => (a.id === S.me ? -1 : b.id === S.me ? 1 : friendStats(b.id).fin - friendStats(a.id).fin));
  const meP = idx.p[S.me] || { display_name: "", color: 3 };
  const list = people
    .map((p) => {
      const st = friendStats(p.id);
      const bits = [];
      if (st.playing) bits.push(`${st.playing} playing`);
      bits.push(`${st.es.length} logged`);
      if (st.hours) bits.push(`${Math.round(st.hours)}h played`);
      const t = taste(p.id);
      const match = t && t.pct != null ? `<span class="match">${t.pct}% match</span>` : "";
      const now = st.es
        .filter((e) => e.status === "playing" && idx.g[e.game_id])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
      const recent = st.es
        .filter((e) => idx.g[e.game_id])
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, 5);
      return `<button class="friend" data-act="open-friend" data-id="${p.id}">
      <span class="f-top">${avatar(p.id)}
        <span class="f-who"><span class="name">${esc(p.display_name)}${p.id === S.me ? ' <span class="subtle small">(you)</span>' : ""}</span>
          <span class="stats">${now ? `Playing ${esc(idx.g[now.game_id].title)}` : esc(bits.join(", "))}</span></span>${match}</span>
      ${recent.length ? `<span class="f-shelf"><span class="f-cases">${recent.map((e) => `<span class="f-case">${gameCover(idx.g[e.game_id], { cls: "sm", sealed: e.status === "want", sticker: e.status === "finished" ? `<span class="stk done">Completed</span>` : "" })}</span>`).join("")}</span><span class="ledge thin"></span></span>` : ""}
      <span class="f-stats"><span><b>${st.fin}</b>completed</span><span><b>${st.playing}</b>playing</span><span><b>${Math.round(st.hours)}h</b>played</span></span>
    </button>`;
    })
    .join("");

  const shareUrl = location.origin + location.pathname;
  return (
    topbar("Friends", false) +
    `
    ${list}
    <section class="panel" aria-labelledby="you-h">
      <h2 class="section-title" id="you-h">Your profile</h2>
      <form data-form="profile">
        <label class="field"><span>Name</span><input class="input" name="name" maxlength="40" value="${esc(meP.display_name)}" autocomplete="nickname"></label>
        <div class="field"><span>Colour</span>
          <div class="swatches" role="group" aria-label="Profile colour">
            ${AVATAR.map((c, i) => `<button type="button" class="swatch" style="--c:${c}" data-act="color" data-color="${i}" aria-pressed="${meP.color === i}" aria-label="Colour ${i + 1}"></button>`).join("")}
          </div></div>
        <button class="btn secondary" type="submit">Save name</button>
      </form>
    </section>
    <section class="panel" aria-labelledby="inv-h">
      <h2 class="section-title" id="inv-h">Invite friends</h2>
      <p class="subtle" style="margin-top:0">Send them this link and your group's invite code. They create an account and they're in.</p>
      <div class="row" style="align-items:center"><input class="input" readonly value="${esc(shareUrl)}" aria-label="App link"><button class="btn secondary" style="flex:none" data-act="copy-link">Copy link</button></div>
    </section>
    <section class="panel">
      ${
        S.api.demo
          ? `<p class="subtle" style="margin-top:0">You're in demo mode.</p><div class="row"><button class="btn secondary" data-act="reset-demo">Reset demo data</button><button class="btn secondary" data-act="exit-demo">Exit demo</button></div>`
          : `<button class="btn secondary block" data-act="sign-out">Sign out</button>`
      }
    </section>`
  );
}
