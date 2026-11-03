// Friends actions and the profile form.
import { reload } from "../../app/reload.js";
import { S, idx } from "../../core/state.js";
import { toast } from "../../ui/feedback.js";
import { renderMain } from "../../ui/screen.js";
import { openSheet } from "../../ui/sheet.js";

export const friendsActions = {
  "open-friend"(el) { openSheet({ kind: "friend", id: el.dataset.id }); },
  async color(el) {
    const c = Number(el.dataset.color);
    const p = idx.p[S.me]; const prev = p ? p.color : null;
    if (p) { p.color = c; renderMain(); }
    try { await S.api.updateProfile(S.me, { color: c }); toast("Colour saved"); }
    catch (e) { if (p) { p.color = prev; renderMain(); } toast(e.message); }
  },
  async "copy-link"() {
    try { await navigator.clipboard.writeText(location.origin + location.pathname); toast("Link copied"); }
    catch (_) { toast("Couldn't copy. Press and hold the link to copy it."); }
  },
};

export const friendsForms = {
  async profile(f) {
    const name = f.name.value.trim();
    if (!name) throw new Error("Enter a name.");
    await S.api.updateProfile(S.me, { display_name: name });
    await reload();
    toast("Name saved");
  },
};
