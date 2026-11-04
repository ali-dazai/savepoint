// Sign-in, create account, join group, not-configured and error screens, and the after-sign-in flow.
import { reload, reloadQuietly } from "../../app/reload.js";
import { S } from "../../core/state.js";
import { debounce, esc, lsGet, lsSet, safeJson } from "../../core/util.js";
import { markHTML } from "../../ui/cover.js";
import { root } from "../../ui/screen.js";

export function renderLoading() {
  root().innerHTML = `<div class="loading" role="status" aria-label="Loading">${markHTML()}</div>`;
}

function authShell(inner) {
  root().innerHTML = `<main class="auth">${markHTML()}${inner}</main>`;
}

export function renderNotConfigured() {
  authShell(`<h1>Save Point</h1>
    <p class="lede">A shared game log for you and your friends: what everyone's playing, what they finished and what they thought.</p>
    <div class="notice">This copy isn't connected to a database yet. Add your Supabase details to <b>config.js</b> (the setup guide shows how), then reload.</div>
    <button class="btn block" data-act="start-demo">Try the demo</button>`);
}

export function renderAuth(mode, message) {
  const signup = mode === "signup";
  const pending = safeJson(lsGet("sp-pending")) || {};
  authShell(`<h1>${signup ? "Join your crew" : "Save Point"}</h1>
    <p class="lede">${signup ? "Create an account with the invite code a friend gave you." : "Track and review games with your friends."}</p>
    ${message ? `<div class="notice" role="status">${message}</div>` : ""}
    <form data-form="${signup ? "signup" : "signin"}" novalidate>
      ${signup ? `<label class="field"><span>Your name</span><input class="input" name="name" autocomplete="nickname" maxlength="40" required value="${esc(pending.name || "")}"></label>` : ""}
      <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="email" inputmode="email" autocapitalize="off" required></label>
      <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required>${signup ? "<small>At least 6 characters.</small>" : ""}</label>
      ${signup ? `<label class="field"><span>Invite code</span><input class="input" name="code" autocapitalize="off" autocomplete="off" required value="${esc(pending.code || "")}"></label>` : ""}
      <p class="error" role="alert"></p>
      <button class="btn block" type="submit">${signup ? "Create account" : "Sign in"}</button>
    </form>
    <p class="switch">${signup ? "Already have an account?" : "New here?"} <button data-act="auth-mode" data-mode="${signup ? "signin" : "signup"}">${signup ? "Sign in" : "Create an account"}</button></p>
    <div class="demo-cta">
      <button class="btn secondary block" data-act="try-demo">Try the demo</button>
      <p>Look around with sample games first. Nothing you do is saved to an account.</p>
    </div>`);
}

function renderJoin(message) {
  const pending = safeJson(lsGet("sp-pending")) || {};
  authShell(`<h1>One more step</h1>
    <p class="lede">Enter the invite code from your friends to join the group.</p>
    <form data-form="join" novalidate>
      <label class="field"><span>Your name</span><input class="input" name="name" autocomplete="nickname" maxlength="40" required value="${esc(pending.name || "")}"></label>
      <label class="field"><span>Invite code</span><input class="input" name="code" autocapitalize="off" autocomplete="off" required value="${esc(pending.code || "")}"></label>
      <p class="error" role="alert">${message ? esc(message) : ""}</p>
      <button class="btn block" type="submit">Join group</button>
    </form>
    <p class="switch"><button data-act="sign-out">Sign out</button></p>`);
}

export async function afterSignIn() {
  renderLoading();
  try {
    const sess = await S.api.session();
    if (!sess) return renderAuth("signin");
    S.me = sess.userId;
    let member = await S.api.isMember();
    if (!member) {
      const pending = safeJson(lsGet("sp-pending"));
      if (pending && pending.code && pending.name) {
        try {
          await S.api.join(pending.code, pending.name);
          member = true;
        } catch (e) {
          return renderJoin(e.message);
        }
      }
    }
    if (!member) return renderJoin();
    lsSet("sp-pending", null);
    if (!S.seenAt) S.seenAt = lsGet("sp-seen") || new Date().toISOString();
    await reload();
    S.api.subscribe(debounce(reloadQuietly, 600));
  } catch (e) {
    renderError(e.message);
  }
}

function renderError(msg) {
  authShell(`<h1>Can't load</h1><div class="notice" role="alert">${esc(msg)}</div>
    <button class="btn block" data-act="retry">Try again</button>
    <p class="switch"><button data-act="sign-out">Sign out</button></p>`);
}
