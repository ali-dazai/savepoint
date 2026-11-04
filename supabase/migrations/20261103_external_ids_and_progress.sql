-- Proposed, NOT applied. Schema the two planned features need (see docs/ARCHITECTURE.md, "Where the next features plug in").
-- Additive only: no existing column changes, no data touched. Safe to run more than once.
--
--   1. game_external_ids   one catalogue game -> its id in each outside system (Steam, IsThereAnyDeal, ...)
--   2. entries.progress_*  where a person is in a game, as structured data instead of free text
--   3. price_predictions   the "buy or wait?" output, written by the Python pipeline, read by the app
--
-- Everything follows the house rules in supabase/migrations/README.md: RLS on, explicit revokes, is_member() gate,
-- column-level update grants, and server-written tables get no write grants for API roles.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. External ids. catalog_games.steam_appid stays for now (the app and the catalog function read it); this table
--    is the general form, and the backfill below copies the existing Steam ids into it.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.game_external_ids (
  igdb_id     bigint not null references public.catalog_games (igdb_id) on delete cascade,
  source      text   not null check (source ~ '^[a-z0-9_]{2,24}$'),   -- 'steam', 'itad', 'gog', 'epic', 'psn', ...
  external_id text   not null check (char_length(external_id) between 1 and 200),
  created_at  timestamptz not null default now(),
  primary key (igdb_id, source),
  unique (source, external_id)
);
create index if not exists game_external_ids_source_idx on public.game_external_ids (source, external_id);

alter table public.game_external_ids enable row level security;
revoke all on public.game_external_ids from anon, authenticated;
grant select on public.game_external_ids to authenticated;
drop policy if exists "members read external ids" on public.game_external_ids;
create policy "members read external ids" on public.game_external_ids
  for select to authenticated using (public.is_member());

insert into public.game_external_ids (igdb_id, source, external_id)
select igdb_id, 'steam', steam_appid from public.catalog_games
where steam_appid is not null and steam_appid ~ '^\d+$'
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Structured progress on a log. Three nullable columns rather than jsonb so column grants and checks apply.
--    kind  : what the number/label counts ('chapter', 'quest', 'area', 'percent', 'custom')
--    label : what the person sees ("Chapter 3", "Reached Liurnia")
--    ord   : a sortable position within the game (chapter number, quest index, percent). The spoiler-free guide
--            compares guide sections' ord against this; the app only needs it to sort and to say "further than".
-- ---------------------------------------------------------------------------------------------------------------
alter table public.entries
  add column if not exists progress_kind  text,
  add column if not exists progress_label text,
  add column if not exists progress_ord   numeric(10,3);

alter table public.entries drop constraint if exists entries_progress_kind_check;
alter table public.entries add constraint entries_progress_kind_check
  check (progress_kind is null or progress_kind in ('chapter', 'quest', 'area', 'percent', 'custom'));
alter table public.entries drop constraint if exists entries_progress_label_check;
alter table public.entries add constraint entries_progress_label_check
  check (progress_label is null or char_length(btrim(progress_label)) between 1 and 120);
alter table public.entries drop constraint if exists entries_progress_shape_check;
alter table public.entries add constraint entries_progress_shape_check
  check ((progress_kind is null) = (progress_label is null));          -- both or neither; ord is optional

grant update (progress_kind, progress_label, progress_ord) on public.entries to authenticated;
-- select/insert on entries are table-level grants already, so the new columns are readable and insertable.

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Price predictions. One row per (game, store, currency). Written only by the pipeline with the secret key;
--    members read. The pipeline keeps raw price history in its own storage; only the answer lands here.
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.price_predictions (
  igdb_id                bigint not null references public.catalog_games (igdb_id) on delete cascade,
  store                  text   not null default 'steam' check (store ~ '^[a-z0-9_]{2,24}$'),
  currency               text   not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  current_price          numeric(8,2) check (current_price is null or current_price >= 0),
  lowest_price           numeric(8,2) check (lowest_price is null or lowest_price >= 0),
  p_discount_30d         numeric(4,3) check (p_discount_30d between 0 and 1),     -- P(any discount within 30 days)
  p_discount_90d         numeric(4,3) check (p_discount_90d between 0 and 1),
  expected_days          int          check (expected_days is null or expected_days >= 0),  -- to the next discount
  expected_discount_pct  int          check (expected_discount_pct between 0 and 100),
  verdict                text   not null check (verdict in ('buy', 'wait', 'unsure')),
  confidence             text   not null check (confidence in ('low', 'medium', 'high')),
  reason                 text   check (reason is null or char_length(reason) <= 300),       -- one line the app shows
  model_version          text   not null,
  computed_at            timestamptz not null default now(),
  primary key (igdb_id, store, currency)
);

alter table public.price_predictions enable row level security;
revoke all on public.price_predictions from anon, authenticated;
grant select on public.price_predictions to authenticated;
drop policy if exists "members read predictions" on public.price_predictions;
create policy "members read predictions" on public.price_predictions
  for select to authenticated using (public.is_member());
