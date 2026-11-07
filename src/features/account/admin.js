// The group admin's tools: resetting a friend's password, and the sheet that shows the temporary one.
import { S, idx } from "../../core/state.js";
import { esc } from "../../core/util.js";
import { sheetFrame } from "../../ui/sheet.js";

export function isAdmin() {
  const me = idx.p[S.me];
  return !!(me && me.is_admin);
}

// At the bottom of a friend's page, for the admin only, and never on your own page.
export function resetPasswordPanel(friendId) {
  const p = idx.p[friendId];
  if (!p || friendId === S.me || !isAdmin()) return "";
  return `<section class="panel admin-panel" aria-labelledby="adm-h">
    <h2 class="section-title" id="adm-h">Group admin</h2>
    <p class="subtle" style="margin-top:0">If ${esc(p.display_name)} can't sign in, give them a temporary password. Their old one stops working.</p>
    <button type="button" class="btn secondary block" data-act="reset-password" data-id="${esc(friendId)}">Reset ${esc(p.display_name)}'s password</button>
  </section>`;
}

// sh: { kind: "temp-password", id, name, password }. The password only lives in this sheet; closing it drops it.
export function tempPasswordSheet(sh) {
  return sheetFrame(
    "Temporary password",
    `<p style="margin-top:0">Send this to <b>${esc(sh.name)}</b> privately, for example in a direct message. They sign in with it and then choose their own.</p>
    <div class="temp-pw" aria-label="Temporary password">${esc(sh.password)}</div>
    <button type="button" class="btn block" data-act="copy-temp-password">Copy password</button>
    <p class="subtle small">Save Point doesn't keep a copy. If this one gets lost, reset again.</p>`,
    `Temporary password for ${sh.name}`,
  );
}
