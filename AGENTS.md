Status file: `PROJECT_LOG.md` in the private repo `ali-dazai/savepoint-notes` (clone it next to this one, at
`~/code/savepoint-notes`). Read it and that repo's `AGENTS.md` before starting.

# Save Point (app repo)

## What the project is

A private, shared game log for a small group of friends: everyone logs what they're playing, want to play, paused,
finished or dropped, with half-star ratings, hours and reviews. It runs mostly as an iPhone home-screen app, needs
an invite code to join and costs nothing to host. This **public** repo is the static front end, served by GitHub
Pages from `main`, plus its tests. The backend source (SQL, Edge Functions) and the project memory (decisions,
changelog, plans, suggestions) live in the private `savepoint-notes` repo.

## Run and test

- Node 22. Once: `npm ci` and `npx playwright install chromium`.
- `npm test` runs `npm run test:unit` (`node --test`, `tests/unit/`) and `npm run test:e2e` (Playwright suites in
  `tests/suites/`, served on `localhost:8765`; `node tests/run.js discover` runs one suite).
- `npm run lint` is ESLint plus a Prettier check; `npm run format` fixes formatting.
- No backend needed to try it: open the site with `?demo`, or tap "Try the demo" on the sign-in screen.
- Deploy = merge to `main`; Pages redeploys in 1–2 minutes. Bump `VERSION` in `sw.js` when the pre-cache list
  changes (a unit test checks the list).
- CI (`.github/workflows/ci.yml`): lint, unit and e2e on every PR and push to `main`. `live-check.yml` checks the
  live Edge Function's `health` daily.

## Hard rules

1. No changes to code, this repo, `savepoint-notes` or the Supabase project without Ali's explicit OK. Asked to
   "find out why", investigate read-only and report back.
2. This repo is public: never commit secrets, the invite code, anyone's email, backend SQL, or anything from
   `savepoint-notes`. The Supabase URL and publishable key in `config.js` are public by design.
3. Branch and pull request; Ali merges (a ruleset on `main` requires a PR and green CI). `git pull --ff-only`
   before committing, never force-push. Commit signed from the laptop (WSL `~/code`), Conventional Commits,
   subject 72 characters max.
4. No `Claude-Session:` link in commit messages or PR text here.
5. No framework, no bundler: files are served as written. `src/data/` is the only code that knows a backend
   exists; a module-graph unit test enforces the layering (`docs/ARCHITECTURE.md`).
6. Ali writes the buy-or-wait price predictor himself; agents review and test it.
7. Run `git config core.hooksPath .githooks` once per clone: the pre-commit hook (also run in CI) keeps this file
   at 80 lines.

## docs/ index

- `docs/ARCHITECTURE.md`: module layout, rules, and where the next features plug in
- `docs/rls-audit.md`: read-only row-level security audit (2026-11-03)
- `docs/screenshot.png`: the README screenshot
- Private docs (decisions, changelog, plans, suggestions, architecture notes): `savepoint-notes/docs/`, indexed in
  that repo's `AGENTS.md`.

## End of every task

At the end of every task, rewrite the status file and add any decision to `docs/decisions.md`. Both are in
`savepoint-notes`; nothing private goes into this repo.
