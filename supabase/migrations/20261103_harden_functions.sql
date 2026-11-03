-- Proposed, NOT applied. Findings F1 and F2 of docs/rls-audit.md.
-- Safe to run more than once. No data or behaviour changes: both functions only ever run as triggers.

-- F1: pin the search path of the one function that didn't have it (Supabase advisor: function_search_path_mutable).
alter function public.touch_updated_at() set search_path = public;

-- F2: trigger functions don't need to be executable by API roles. PostgREST can't call them anyway
-- (they return `trigger`), so this only makes the grants say what we mean.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.entry_dates() from public, anon, authenticated;
