# Database migrations

The database is a Supabase project. Its **baseline schema and the migrations already applied** live in the private
notes repo (`savepoint-notes/backend/`), because that history includes the setup script with the invite-code
placeholder. This folder holds **proposed** migrations only: SQL that has been reviewed but **not yet applied** to the
live project. Nothing here runs automatically.

| File | Status | What it does |
|---|---|---|
| `20261103_harden_functions.sql` | proposed | Pins `search_path` on `touch_updated_at()`; revokes API-role `EXECUTE` on the two trigger functions. See `docs/rls-audit.md` F1–F2. |

## Applying one

Paste the file into Supabase → SQL Editor and run it, or apply it through the Supabase connector with Ali's OK.
Then record it in the project log (§4.7/§4.8 and §7) and move it to the notes repo's `backend/migrations/`.

## Writing one (template)

Supabase's default privileges grant `anon` and `authenticated` **all** rights on every new table, sequence and
function in `public` (see `docs/rls-audit.md` F3). New tables get RLS switched on automatically, so they deny by
default, but new functions are callable by anyone until you say otherwise. Every migration must therefore be
explicit:

```sql
create table if not exists public.example (...);
alter table public.example enable row level security;
revoke all on public.example from anon, authenticated;
grant select on public.example to authenticated;           -- only what the app needs
drop policy if exists "members read example" on public.example;
create policy "members read example" on public.example
  for select to authenticated using (public.is_member());

create or replace function public.example_fn() ... set search_path = public ...;
revoke all on function public.example_fn() from public, anon;
grant execute on function public.example_fn() to authenticated; -- if the app calls it
```

Rules of thumb: idempotent statements (`if not exists`, `create or replace`, `drop policy if exists`), the
`is_member()` gate on every member-readable table, column-level `grant update (...)` instead of table-level
update, and server-written tables (anything a pipeline or Edge Function fills) get **no** write grants for API
roles at all.
