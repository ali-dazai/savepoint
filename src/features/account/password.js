// Choosing a new password: shared fields and checks for the screen after a reset and for Change password.
import { S } from "../../core/state.js";
import { esc } from "../../core/util.js";

// Shown on the sign-in screen. There's no email reset (decision O8): the group admin resets it from inside the app.
export const FORGOT_PASSWORD_MSG =
  "Ask the friend who runs your group to reset it: they open your page under <b>Friends</b>, tap <b>Reset password</b> and send you a temporary one.";

// null when fine, otherwise what to fix.
export function newPasswordError(password, confirm) {
  if (!password || password.length < 6) return "Use a password with at least 6 characters.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

// The two inputs. A hidden username field lets the phone's password manager save the new password to the right account.
export function newPasswordFields(email) {
  return `${email ? `<input type="email" name="username" autocomplete="username" value="${esc(email)}" hidden>` : ""}
    <label class="field"><span>New password</span><input class="input" type="password" name="password" autocomplete="new-password" minlength="6" required><small>At least 6 characters.</small></label>
    <label class="field"><span>Type it again</span><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="6" required></label>`;
}

// Under Your profile on the Friends tab. Not shown in the demo, which has no account.
export function changePasswordPanel() {
  if (S.api.demo) return "";
  return `<section class="panel" aria-labelledby="pw-h">
    <h2 class="section-title" id="pw-h">Change password</h2>
    <form data-form="change-password" novalidate>
      ${newPasswordFields(S.email)}
      <p class="error" role="alert"></p>
      <button class="btn secondary" type="submit">Change password</button>
    </form>
  </section>`;
}
