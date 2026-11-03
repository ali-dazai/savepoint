// Turns Supabase and server-function errors into plain-English messages.

export function errMsg(e) {
  if (!e) return "Something went wrong.";
  const m = e.message || String(e);
  if (/Invalid login credentials/i.test(m)) return "That email and password don't match.";
  if (/User already registered/i.test(m)) return "There's already an account with that email. Sign in instead.";
  if (/Password should be/i.test(m)) return "Use a password with at least 6 characters.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Can't reach the server. Check your connection and try again.";
  if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent you, then sign in.";
  if (/games_igdb_id_key/i.test(m)) return "That game is already on the shelf.";
  return m;
}

export const CATALOG_ERRORS = {
  sign_in_required: "Sign in again to search the games database.",
  not_a_member: "Join the group to search the games database.",
  igdb_busy: "The games database is busy. Try again in a moment.",
  not_found: "That game isn't in the games database any more.",
};
export function catalogError(code) {
  return new Error(CATALOG_ERRORS[code] || "Can't reach the games database right now. You can still add the game by hand.");
}
