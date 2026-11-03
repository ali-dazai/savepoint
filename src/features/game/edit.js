// Edit game details sheet and the shared field validation for add/edit.
import { PLATFORMS } from "../../core/constants.js";
import { S, catOf, idx } from "../../core/state.js";
import { esc } from "../../core/util.js";
import { sheetFrame } from "../../ui/sheet.js";

export function editSheet(id) {
  const g = idx.g[id];
  if (!g) return "";
  const c = catOf(g);
  const linkRow = S.api.catalogSearch ? `<div class="panel link-panel">
      ${c ? `<p style="margin:0 0 12px">Linked to <b>${esc(c.name)}</b> in the games database.</p>
        <div class="row"><button type="button" class="btn secondary" data-act="link-start" data-id="${id}">Change</button><button type="button" class="btn danger" data-act="unlink" data-id="${id}">Unlink</button></div>`
      : `<p style="margin:0 0 12px">Not linked to the games database yet. Link it to get cover art, genres, the critic score and Steam reviews.</p>
        <button type="button" class="btn secondary block" data-act="link-start" data-id="${id}">Link to the games database</button>`}
    </div>` : "";
  return sheetFrame("Edit game details", `${linkRow}
    <form data-form="edit" data-id="${id}" novalidate>
      <label class="field"><span>Title</span><input class="input" name="title" maxlength="120" required value="${esc(g.title)}"></label>
      <div class="row">
        <label class="field"><span>Platform</span><input class="input" name="platform" list="platforms" maxlength="40" value="${esc(g.platform || "")}"></label>
        <label class="field" style="flex:0.6"><span>Year</span><input class="input" name="year" type="number" inputmode="numeric" min="1950" max="2100" value="${g.year || ""}"></label>
      </div>
      <datalist id="platforms">${PLATFORMS.map((p) => `<option value="${p}">`).join("")}</datalist>
      <label class="field"><span>Cover image link</span><input class="input" name="cover_url" type="url" inputmode="url" autocapitalize="off" value="${esc(g.cover_url || "")}" placeholder="https://…"></label>
      <p class="error" role="alert"></p>
      <div class="row"><button type="button" class="btn secondary" data-act="open-game" data-id="${id}">Cancel</button><button class="btn" type="submit">Save details</button></div>
    </form>`);
}
export function gameFields(f) {
  const title = f.title.value.trim();
  if (!title) throw new Error("Enter the game's title.");
  const platform = f.platform.value.trim() || null;
  const yearRaw = f.year.value.trim();
  const year = yearRaw ? Number(yearRaw) : null;
  if (year != null && (!Number.isInteger(year) || year < 1950 || year > 2100)) throw new Error("Enter a year like 2024, or leave it blank.");
  const cover = f.cover_url.value.trim() || null;
  if (cover && !/^https:\/\//i.test(cover)) throw new Error("The cover link needs to start with https://");
  return { title, platform, year, cover_url: cover };
}
