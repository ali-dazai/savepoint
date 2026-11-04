import { test } from "node:test";
import assert from "node:assert/strict";
import { newPasswordError, newPasswordFields, FORGOT_PASSWORD_MSG } from "../../src/features/account/password.js";
import { isAdmin, resetPasswordPanel, tempPasswordSheet } from "../../src/features/account/admin.js";
import { errMsg, accountError } from "../../src/data/errors.js";
import { DemoApi } from "../../src/data/demo.js";
import { S } from "../../src/core/state.js";
import { loadFixture, ME, MAYA } from "./fixture.js";

test("newPasswordError: length first, then the two must match", () => {
  assert.equal(newPasswordError("", ""), "Use a password with at least 6 characters.");
  assert.equal(newPasswordError("12345", "12345"), "Use a password with at least 6 characters.");
  assert.equal(newPasswordError("hunter22", "hunter2"), "The two passwords don't match.");
  assert.equal(newPasswordError("hunter22", "hunter22"), null);
});

test("newPasswordFields escapes the username and uses new-password autocomplete", () => {
  const html = newPasswordFields('a"b@x.com');
  assert.match(html, /value="a&quot;b@x\.com"/);
  assert.equal((html.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.doesNotMatch(newPasswordFields(null), /username/);
  assert.match(FORGOT_PASSWORD_MSG, /Reset password/);
});

test("the reset panel shows only for the admin, and never on their own page", () => {
  loadFixture();
  S.profiles.find((p) => p.id === ME).is_admin = true;
  loadFixture({ profiles: S.profiles });
  assert.equal(isAdmin(), true);
  assert.match(resetPasswordPanel(MAYA), /data-act="reset-password" data-id="u-maya"/);
  assert.match(resetPasswordPanel(MAYA), /Reset Maya's password/);
  assert.equal(resetPasswordPanel(ME), "");
  assert.equal(resetPasswordPanel("nobody"), "");
  S.profiles.find((p) => p.id === ME).is_admin = false;
  loadFixture({ profiles: S.profiles });
  assert.equal(isAdmin(), false);
  assert.equal(resetPasswordPanel(MAYA), "");
});

test("tempPasswordSheet shows the password escaped, with a copy button", () => {
  const html = tempPasswordSheet({ kind: "temp-password", id: MAYA, name: "<Maya>", password: "k7qm-3xvp-9tnr" });
  assert.match(html, /<div class="temp-pw"[^>]*>k7qm-3xvp-9tnr<\/div>/);
  assert.match(html, /&lt;Maya&gt;/);
  assert.match(html, /data-act="copy-temp-password"/);
});

test("password errors read as plain English", () => {
  assert.equal(
    errMsg({ message: "New password should be different from the old password." }),
    "That's your current password. Pick a different one.",
  );
  assert.equal(
    errMsg({ message: "Password update requires reauthentication" }),
    "For safety, sign out and back in, then change your password.",
  );
  assert.equal(accountError("not_admin").message, "Only the group admin can reset passwords.");
  assert.equal(
    accountError("own_account").message,
    "To change your own password, use Change password under Your profile.",
  );
  assert.match(accountError().message, /Couldn't reach the server/);
});

test("DemoApi: 'you' are the admin (also in old saved demo data) and resets follow the server's rules", async () => {
  const api = new DemoApi();
  const { profiles } = await api.loadAll();
  assert.equal(profiles.find((p) => p.id === "demo-me").is_admin, true);
  assert.deepEqual(await api.adminResetPassword("demo-maya"), { password: "demo-pass-word", name: "Maya" });
  await assert.rejects(api.adminResetPassword("demo-me"), /Change password under Your profile/);
  await assert.rejects(api.adminResetPassword("nobody"), /isn't in the group/);
  await assert.rejects(api.changePassword("short"), /at least 6/);
  await api.changePassword("long enough");
  // saved before admins existed: no is_admin field at all
  api.db.profiles.forEach((p) => delete p.is_admin);
  globalThis.localStorage = { getItem: () => JSON.stringify(api.db), setItem() {}, removeItem() {} };
  const old = new DemoApi();
  delete globalThis.localStorage;
  assert.equal(old.db.profiles.find((p) => p.id === "demo-me").is_admin, true);
  assert.equal(old.db.profiles.find((p) => p.id === "demo-maya").is_admin, undefined);
});
