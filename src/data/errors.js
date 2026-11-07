// Turns Supabase and server-function errors into plain-English messages.

export function errMsg(e) {
  if (!e) return "Something went wrong.";
  const m = e.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match.";
  if (/User already registered/i.test(m)) return "There's already an account with that email. Sign in instead.";
  // Before the generic "Password should be…" rule below, which would also match this one.
  if (/should be different from the old password/i.test(m))
    return "That's your current password. Pick a different one.";
  if (/Password should be/i.test(m)) return "Use a password with at least 6 characters.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m))
    return "Can't reach the server. Check your connection and try again.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you, then sign in.";
  if (/games_igdb_id_key/i.test(m)) return "That game is already on the shelf.";
  if (/reauthenticat/i.test(m)) return "For safety, sign out and back in, then change your password.";
  return m;
}

export const CATALOG_ERRORS = {
  sign_in_required: "Sign in again to search the games database.",
  not_a_member: "Join the group to search the games database.",
  igdb_busy: "The games database is busy. Try again in a moment.",
  not_found: "That game isn't in the games database any more.",
};
// Codes from the `account` Edge Function (backend repo: functions/account/handler.ts).
export const ACCOUNT_ERRORS = {
  sign_in_required: "Sign in again, then try that.",
  not_a_member: "Only group members can do that.",
  not_admin: "Only the group admin can reset passwords.",
  own_account: "To change your own password, use Change password under Your profile.",
  not_found: "That person isn't in the group any more.",
};
export function accountError(code) {
  return new Error(ACCOUNT_ERRORS[code] || "Couldn't reach the server. Check your connection and try again.");
}
export function catalogError(code) {
  return new Error(
    CATALOG_ERRORS[code] || "Can't reach the games database right now. You can still add the game by hand.",
  );
}
