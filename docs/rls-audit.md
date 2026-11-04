# Row-level security audit

**Date:** 2026-11-03 · **Project:** Supabase `evkzdabyyxbtchqtebfr` (eu-west-1, Postgres 17) · **Method:** read-only. The
SQL files in the private notes repo were compared with the live catalog (`pg_class`, `pg_policies`,
`information_schema.role_table_grants` / `role_column_grants`, `pg_proc`, `pg_default_acl`) and with Supabase's
security advisor. Nothing was changed. Proposed fixes are in [`supabase/migrations/`](../supabase/migrations/) and
are **not applied**.

## Verdict

The access model is sound. Every table has RLS enabled, `anon` has no privileges on anything, and the policies
plus column-level grants limit signed-in members to exactly what the app needs. The three server-only tables are
unreadable from the client. Two low-risk hygiene items are worth fixing (below), and two auth settings are worth
turning on in the dashboard.

## Table by table

| Table             | RLS             | `anon`  | `authenticated` can…                                                                                                                                                                        | Verdict                                                        |
| ----------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `settings`        | on, no policies | nothing | nothing (all privileges revoked)                                                                                                                                                            | ✅ invite code unreadable from the app                         |
| `profiles`        | on              | nothing | select all rows (`is_member()`); update own row, columns `display_name, color` only                                                                                                         | ✅ no insert/delete; membership only via `join_group()`        |
| `games`           | on              | nothing | select (`is_member()`); insert with `added_by = auth.uid()`; update any row (`is_member()`), columns `title, platform, year, cover_url, igdb_id` only; delete where `added_by = auth.uid()` | ✅ matches decision D12 (anyone edits, only the adder deletes) |
| `entries`         | on              | nothing | select (`is_member()`); insert with `user_id = auth.uid()`; update/delete own rows, update columns `status, rating, hours, review, spoiler, started_at, finished_at` only                   | ✅ `game_id`/`user_id` can't be moved (no column grant)        |
| `catalog_games`   | on              | nothing | select (`is_member()`)                                                                                                                                                                      | ✅ writes only by the Edge Function (secret key)               |
| `server_cache`    | on, no policies | nothing | nothing                                                                                                                                                                                     | ✅ holds the Twitch token and cron token                       |
| `trend_snapshots` | on, no policies | nothing | nothing                                                                                                                                                                                     | ✅ server-only history                                         |

`force row level security` is not set anywhere. That only matters for the table owner (`postgres`), which the app
never connects as, so it is fine.

## Functions

| Function                       | Definer?     | `search_path` pinned | Executable by                     | Verdict                                                                                                                 |
| ------------------------------ | ------------ | -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `is_member()`                  | yes          | yes                  | `authenticated`                   | ✅ intended (it is what every policy gates on)                                                                          |
| `join_group(code, name)`       | yes          | yes                  | `authenticated`                   | ✅ intended; the only way into `profiles`                                                                               |
| `add_hours(entry, delta)`      | no (invoker) | yes                  | `authenticated`                   | ✅ RLS still applies; clamps delta to ±100                                                                              |
| `entry_dates()` (trigger)      | no           | yes                  | `anon`, `authenticated` (default) | ⚠️ hygiene, see F2                                                                                                      |
| `touch_updated_at()` (trigger) | no           | **no**               | `anon`, `authenticated` (default) | ⚠️ advisor warning, see F1                                                                                              |
| `rls_auto_enable()`            | yes          | yes                  | `anon`, `authenticated`           | Supabase's own helper, not ours. Postgres refuses to run event-trigger functions directly, so it is harmless. Leave it. |

## Findings

**F1 — `touch_updated_at()` has a mutable `search_path`** (advisor `function_search_path_mutable`, WARN). It is not
`security definer` and only ever runs as a trigger, so the practical risk is nil, but pinning it costs nothing and
clears the warning. Fix: `alter function public.touch_updated_at() set search_path = public;` (in the proposed
migration).

**F2 — trigger functions are executable by `anon` and `authenticated`.** Postgres grants `EXECUTE` to `PUBLIC` on
new functions by default, and this project's default ACL also grants it to `anon`/`authenticated` explicitly.
Trigger functions can't be called through PostgREST (they return `trigger`), so again no practical exposure, but
revoking keeps the "nothing is callable unless we said so" rule true. Fix in the proposed migration.

**F3 — default privileges for future objects.** `pg_default_acl` shows that every new table, sequence and function
in `public` is granted to `anon` and `authenticated` automatically (Supabase's default). New tables get RLS turned
on by Supabase's `rls_auto_enable` event trigger, so they deny by default, but **new functions are callable by
anyone** until revoked. Every future migration (price predictions, guide) must therefore end with explicit
`revoke all on <table> from anon, authenticated` and `revoke all on function <fn> from public, anon` lines, as the
existing ones do. The template in `supabase/migrations/README.md` says so.

**F4 — a game whose adder leaves becomes undeletable.** `games.added_by` is `on delete set null`, and the only
delete policy is `added_by = auth.uid()`. Low impact (Ali can delete rows in the dashboard). Options if it ever
matters: let any member delete games that nobody else has logged, or reassign `added_by` when a profile is
deleted. Not changed; recorded as a suggestion.

**F5 — invite code brute force.** `join_group()` is callable by any signed-in account with no rate limit beyond
Supabase's API limits, and sign-up is open. The code is the only barrier to joining. Mitigation is already on the
suggestions list (S43: a long random code). Enabling Supabase's **leaked-password protection** (advisor WARN) and
keeping **email confirmation** on also raise the cost of throwaway accounts. Dashboard settings, not SQL.

**F6 — advisor items that are intentional.** `rls_enabled_no_policy` on `settings`, `server_cache`,
`trend_snapshots` (server-only tables) and `*_security_definer_function_executable` on `is_member`/`join_group`
are the design, not defects.

## Things checked and found correct

- `anon` has zero table or column privileges in `public`; the publishable key alone reads nothing.
- Column grants, not just policies, stop an entry being moved to another user/game and stop `added_by` changes.
- The realtime publication contains only `games` and `entries`; realtime respects RLS.
- `catalog_games` exposes no secrets (the Twitch token lives in `server_cache`).
- The SQL files in the notes repo and the live database agree on every table, policy, grant and function.

## Data snapshot (counts only)

2 profiles, 5 games (all linked to IGDB), 6 entries, 23 catalogue rows (19 with a Steam app id).
