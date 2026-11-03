// Auth and demo-mode actions and forms.
import { start } from "../../app/boot.js";
import { reload } from "../../app/reload.js";
import { S } from "../../core/state.js";
import { esc, lsSet } from "../../core/util.js";
import { afterSignIn, renderAuth } from "./screens.js";
import { confirmDialog, toast } from "../../ui/feedback.js";
import { closeSheet } from "../../ui/sheet.js";

export const authActions = {
  async "sign-out"() {
    try {
      await S.api.signOut();
    } catch (_) {}
    S.me = null;
    closeSheet();
    renderAuth("signin");
  },
  "auth-mode"(el) {
    renderAuth(el.dataset.mode);
  },
  "start-demo"() {
    lsSet("sp-demo", "1");
    start();
  },
  // Demo from the sign-in screen: lives in the URL (?demo), so reopening the app lands on sign-in again (S1).
  "try-demo"() {
    history.replaceState(null, "", location.pathname + "?demo" + location.hash);
    start();
  },
  "exit-demo"() {
    lsSet("sp-demo", null);
    closeSheet();
    if (location.search.includes("demo")) history.replaceState(null, "", location.pathname + location.hash);
    start();
  },
  async "reset-demo"() {
    const ok = await confirmDialog({
      title: "Reset demo data?",
      body: "Your demo changes will be replaced with the sample games.",
      ok: "Reset",
    });
    if (!ok) return;
    S.api.reset();
    await reload();
    toast("Demo data reset");
  },
  retry() {
    afterSignIn();
  },
};

export const authForms = {
  async signin(f) {
    const email = f.email.value.trim(),
      password = f.password.value;
    if (!email || !password) throw new Error("Enter your email and password.");
    await S.api.signIn(email, password);
    await afterSignIn();
  },
  async signup(f) {
    const name = f.name.value.trim(),
      email = f.email.value.trim(),
      password = f.password.value,
      code = f.code.value.trim();
    if (!name || !email || !password || !code) throw new Error("Fill in all four fields.");
    if (password.length < 6) throw new Error("Use a password with at least 6 characters.");
    lsSet("sp-pending", JSON.stringify({ name, code }));
    const res = await S.api.signUp(email, password);
    if (res.needsConfirm) {
      return renderAuth(
        "signin",
        `We sent a confirmation link to <b>${esc(email)}</b>. Open it, then come back here and sign in.`,
      );
    }
    await afterSignIn();
  },
  async join(f) {
    const name = f.name.value.trim(),
      code = f.code.value.trim();
    if (!name || !code) throw new Error("Enter your name and the invite code.");
    await S.api.join(code, name);
    lsSet("sp-pending", null);
    await afterSignIn();
  },
};
