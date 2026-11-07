// Account actions (admin password reset, copying the temporary password) and the Change password form.
import { S, idx } from "../../core/state.js";
import { busy, confirmDialog, toast } from "../../ui/feedback.js";
import { openSheet } from "../../ui/sheet.js";
import { newPasswordError } from "./password.js";

export const accountActions = {
  async "reset-password"(el) {
    const id = el.dataset.id;
    const p = idx.p[id];
    if (!p) return;
    const ok = await confirmDialog({
      title: `Reset ${p.display_name}'s password?`,
      body: "Their current password stops working straight away. You'll get a temporary one to send them, and they choose their own when they sign in with it.",
      ok: "Reset password",
      danger: true,
    });
    if (!ok) return;
    await busy(el, async () => {
      try {
        const res = await S.api.adminResetPassword(id);
        openSheet({ kind: "temp-password", id, name: res.name || p.display_name, password: res.password }, true);
      } catch (e) {
        toast(e.message);
      }
    });
  },
  async "copy-temp-password"() {
    if (!S.sheet || !S.sheet.password) return;
    try {
      await navigator.clipboard.writeText(S.sheet.password);
      toast("Password copied");
    } catch (_) {
      toast("Couldn't copy. Press and hold the password to copy it.");
    }
  },
};

export const accountForms = {
  async "change-password"(f) {
    const problem = newPasswordError(f.password.value, f.confirm.value);
    if (problem) throw new Error(problem);
    await S.api.changePassword(f.password.value);
    f.reset();
    toast("Password changed");
  },
};
