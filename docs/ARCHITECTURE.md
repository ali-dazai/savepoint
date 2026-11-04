# Architecture

Save Point is a static site (plain HTML, CSS and ES modules, no framework, no build step) on GitHub Pages, talking
to one Supabase project (Postgres with row-level security, Auth, Realtime, one Edge Function). This document
explains how the front end is organised, what the rules are, and where the next two features plug in.

```
browser (iPhone home-screen app or any browser)
┌────────────────────────────────────────────────────────────────────┐
│ index.html → config.js → vendor/supabase.js → src/main.js (module) │
│ sw.js pre-caches every file listed in SHELL (tests/unit guards it)  │
└──────────────┬──────────────────────────────────────┬──────────────┘
               │ supabase-js: Auth, REST, RPC, Realtime,│ <img> covers
               │ functions.invoke("catalog")            ▼
┌──────────────▼───────────────────────────┐    images.igdb.com
│ Supabase                                 │
│  Postgres (RLS on every table)           │──► IGDB (via Twitch), Steam
│  Edge Function `catalog` (Deno)          │
│  pg_cron daily snapshot → `catalog`      │
└──────────────────────────────────────────┘
```

## Folders

```
src/
  main.js            entry point: registers every feature with the shell, wires events, boots
  app/               the shell's plumbing (no UI, no feature knowledge)
    boot.js          start(): picks DemoApi or SupabaseApi from config.js and the URL
    reload.js        reload(): fetch everything, reindex, redraw
    wiring.js        one delegated listener per DOM event type
    gestures.js      hold-to-add-an-hour, swipe to close, pull to refresh
    actions.js       shell actions: tab, close, backdrop, update-refresh
  core/              pure, framework-free
    constants.js     statuses, platforms, icons, image URL builder
    state.js         the state object S, the index idx, derived lookups (myEntry, groupScore, releaseInfo…)
    util.js          esc, dates, number formatting, localStorage helpers, $, debounce
    registry.js      tabs, sheet kinds, data-act handlers, data-form handlers
  data/              the only code that knows a backend exists
    supabase.js      SupabaseApi: auth, tables, RPCs, the `catalog` function
    demo.js          DemoApi: same interface, sample data in localStorage
    errors.js        Supabase/function errors → plain English
  ui/                shared presentation
    theme.js         cover tints, the wall palette, the booklet palette
    cover.js         game cases, stickers, stars, avatars, spoiler text
    screen.js        renderMain(): the active tab + tab bar
    sheet.js         sheets and pages in #layer: open/close/back stack, frames
    feedback.js      confirm dialog, toast, busy
    update.js        service worker registration and the update banner
  features/<name>/   one folder per feature; views/sheets/pages plus actions.js
    auth/ feed/ shelf/ discover/ friends/ game/ catalog/ picks/ share/
tests/
  unit/              node:test suites for the pure modules (npm run test:unit)
  run.js, suites/    Playwright suites against a local copy of the site (npm run test:e2e)
docs/                this file, the RLS audit, the README screenshot
```

Runtime files stay at the root because GitHub Pages serves the repo as-is: `index.html`, `styles.css`, `sw.js`,
`config.js` (the only deployment-specific file; never formatted or touched by tooling), `manifest.webmanifest`,
`fonts/`, `icons/`, `vendor/`.

## How a screen works

1. **State in, HTML out.** Every view is a function of `S` (the state) and `idx` (lookups rebuilt by `reindex()`),
   returning an HTML string built with template literals. `esc()` wraps every user-supplied value. There is no
   virtual DOM: `renderMain()` replaces `#app`, `renderSheet()` replaces `#layer`, and a few hot paths replace a
   smaller element (`#shelf-results`, `#cat-results`, `#others`, `#chips`) so the iOS keyboard stays open.
2. **Events are declarative.** Buttons carry `data-act="name"`, forms carry `data-form="name"`. `app/wiring.js`
   listens once on `document` and dispatches to the registries. A feature never adds its own click listeners.
3. **Features register, the shell renders.** `main.js` calls `registerTab`, `registerSheet`, `registerActions`
   and `registerForms`. The shell has no `if (kind === "game")` chains: `renderSheet()` asks the registry for the
   kind's `render`, `openSheet()` calls its `onOpen`, and `refreshOpenSheet()` calls its `refresh` after a reload.
   Tabs can declare `onEnter` / `onReselect` (Discover uses them to load its lists).
4. **Data goes through `S.api`.** Screens call `S.api.loadAll()`, `S.api.saveEntry()`, `S.api.catalogSearch()`
   and so on. `src/data/` is the only place that imports supabase-js or touches `window.supabase`; `DemoApi`
   implements the same methods, so every screen works offline in demo mode and in the tests. Optional backends are
   feature-detected (`S.api.catalogSearch ? "search" : "manual"`).
5. **Saves are optimistic.** `features/game/log.js` applies a change locally, re-renders, then saves through a
   per-game queue and rolls back on failure. `applyLocalEntry()` mirrors the database's date trigger so the UI
   agrees with what the server will store.

Layers import strictly downwards: `core ← data ← ui ← features ← app ← main`, with one allowance: features may
call `app/reload.js` and `app/boot.js`. There are no import cycles, and only `src/data` mentions supabase-js.
`tests/unit/module-graph.test.js` asserts all of this, so the layout can't drift quietly.

## Rules worth keeping

- **No build step.** Files are served as written. New code is an ES module under `src/`; add it to `SHELL` in
  `sw.js` (the unit test `sw-precache.test.js` fails until you do) and bump `VERSION` when the list changes.
- **Security lives in the database.** Every table has RLS; `is_member()` gates reads; column-level grants limit
  writes. The browser holds only the publishable key. See [`rls-audit.md`](rls-audit.md) and the migration
  template in the private notes repo (`backend/migrations/README.md`): every new table and function must revoke
  `anon`/`authenticated` explicitly, because Supabase's defaults grant them everything (audit F3). Anything that needs a secret
  (IGDB, Steam, an LLM, a price API) runs in an Edge Function or an offline pipeline, never in `src/`.
- **Behaviour-preserving refactors are separate commits** from fixes, and fixes come with a test.
- **Specific class names.** Generic ones (`.loading`, `.manual`) have collided before (incident I3). New components
  get their own prefix.

## Where the next features plug in

### Buy-or-wait price predictor

A separate Python pipeline pulls price history from the IsThereAnyDeal API, trains two models (time to next
discount, discount depth) and writes one row per game to a `price_predictions` table. The app reads it and shows a
verdict with a confidence level on the game page.

| Piece                   | Where                                                                                                                                                                             | Notes                                                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Game → ITAD id          | `game_external_ids` table (proposed migration, private notes repo)                                                                                                                | One row per `(igdb_id, source)`; `source = 'itad'`. Steam ids are backfilled from `catalog_games.steam_appid`. The pipeline resolves ITAD ids by Steam app id (ITAD's lookup takes Steam ids) and writes them here with the secret key.           |
| Predictions             | `price_predictions` table (proposed migration, private notes repo)                                                                                                                | Server-written, members read. Columns: probabilities at 30/90 days, expected days and depth, `verdict` buy/wait/unsure, `confidence`, a one-line `reason`, `model_version`, `computed_at`. Raw price history stays in the pipeline's own storage. |
| Reading them in the app | `src/data/supabase.js` → add the table to `loadAll()` (or a `predictions(ids)` method), `src/data/demo.js` → a few fake rows                                                      | Keeps the UI unaware of where predictions come from.                                                                                                                                                                                              |
| Showing them            | `src/features/game/page.js` → one new chip in `scoreChips()` or a small block under "Your log" for Want to play games; `src/ui/cover.js` could add a price tag to the shrink-wrap | Only the game page needs to change. The `S.catalog`/`idx.c` row is the natural place to attach the prediction for the page to read.                                                                                                               |
| Freshness               | the pipeline's own schedule; the app shows `computed_at` as "updated 3 days ago" via `ago()`                                                                                      | No new client-side caching needed.                                                                                                                                                                                                                |

The pipeline needs **no changes to the Edge Function**: it talks to Postgres directly with the service key, which
bypasses RLS and is never in the repo. Keep the pipeline in its own repository (or a top-level `pipeline/` folder
with its own README); it shares nothing with `src/` except the table shapes above.

### Spoiler-free game guide

Answers questions using only guide/wiki sections at or before the person's tracked progress in that game. LLM
calls run server-side in a Supabase Edge Function; the browser never holds an API key.

| Piece                   | Where                                                                                                                                                                                                                                                             | Notes                                                                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracked progress        | `entries.progress_kind / progress_label / progress_ord` (proposed migration, private notes repo)                                                                                                                                                                  | Structured instead of free text. `progress_ord` is the comparable position; `kind` says what it counts. Only the owner can set it (existing `edit own entry` policy + column grant).           |
| Editing progress        | `src/features/game/page.js` (the log form) + `src/features/game/actions.js` (`entry` form) + `applyLocalEntry()`                                                                                                                                                  | Add the fields to `S.draft`, the form, and `fields` in the `entry` form handler, exactly like `spoiler` was added in R1. `DemoApi.saveEntry` needs nothing: it stores whatever fields it gets. |
| Guide content           | a new server-only table, e.g. `guide_sections (igdb_id, ord, title, body, source_url)` with RLS on and **no** grants to API roles                                                                                                                                 | Filled by an ingestion job (future). The ordering key `ord` is what the function compares against `progress_ord`.                                                                              |
| Asking a question       | a new Edge Function (e.g. `guide`) that: checks the caller is a member (copy the `catalog` function's auth block), reads the caller's `progress_ord` for the game, selects sections with `ord <= progress_ord`, calls the LLM with only those, returns the answer | Secrets (LLM key) live in Edge Function secrets. Deploy with `verify_jwt = false` and in-code auth like `catalog` (decision D13).                                                              |
| Calling it from the app | `src/data/supabase.js` → `guideAsk(igdbId, question)` using `functions.invoke("guide", …)` (the generic `catalog()` helper shows the error-mapping pattern); `src/data/demo.js` → a canned answer                                                                 | The UI calls `S.api.guideAsk` and feature-detects it like `catalogSearch`.                                                                                                                     |
| UI                      | `src/features/guide/` with a sheet (`registerSheet("guide", …)`) opened from a button on the game page, plus `guideActions`/`guideForms` registered in `main.js`                                                                                                  | Nothing in the shell changes.                                                                                                                                                                  |

### Checklist for any new feature

1. Schema: a migration in the private notes repo (`backend/migrations/proposed/`) following the template; test it on local Postgres; apply with
   Ali's OK; record it in the project log.
2. Data: a method on `SupabaseApi` **and** `DemoApi`.
3. Feature folder with views and `actions.js`; registrations in `main.js`; files added to `sw.js` `SHELL`.
4. A unit test for the pure parts, an e2e check in `tests/suites/` for the flow, and a line in the README's
   feature list.
