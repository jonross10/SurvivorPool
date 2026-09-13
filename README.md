# Survivor Pool

A Next.js/Vercel app that recommends weekly NFL survivor-pool picks for the pool's entries
(configured in `src/lib/entries.ts`). It
fetches de-vigged moneyline odds (The Odds API) for the current week and FPI-projected win
probabilities (ESPN) for future weeks, then runs a **season-optimal assignment engine** that
assigns each still-available team to the week where it does the most for your survival —
so it won't burn a juggernaut on an easy week if a solid weaker team gets you through and
the juggernaut is worth more later. A tunable per-week **safety floor** lets you refuse any
pick below a chosen win-probability, and every recommendation shows its reasoning plus the
greedy (highest-win-probability) alternative.

State lives in **Postgres (Neon)**; a `UNIQUE(entry_id, team)` constraint enforces the core
survivor rule (a team can be used at most once per entry) at the database level.

This replaces the old AWS-Lambda + Selenium scraper and Google Sheet.

## Architecture

- **Pure core** (`src/lib`): `odds.ts` (implied prob + de-vig), `projection.ts` (FPI logistic
  win prob), `matching.ts` (Hungarian max-weight assignment), `winprob-matrix.ts`,
  `pick-engine.ts` (season-optimal + safety floor), `recommendations.ts`, `week.ts`. All
  unit-tested, no I/O.
- **Sources** (`src/lib/sources`): `espn-schedule.ts`, `espn-fpi.ts`, `odds-api.ts`, and
  `ingest.ts` (fetch → normalize → cache). Parsers tested against captured fixtures.
- **Data** (`src/lib/db`): Neon client (lazy), `schema.sql`, `migrate.ts`, cache + picks repos.
- **App** (`src/app`): dashboard (`/`), grid (`/grid`), pick log (`/log`), and API routes
  (`/api/recommendations`, `/api/pick`, `/api/refresh`, `/api/cron/refresh`, `/api/grid`,
  `/api/log`). `src/middleware.ts` is a single-password gate.

## Setup (use your personal accounts)

1. `npm install`
2. Create a free **Neon** Postgres project; set `NEON_DB_CONNECTION_URL`.
3. Get a free key at **the-odds-api.com**; set `ODDS_API_KEY`.
4. Set `APP_PASSWORD` (site gate), `CRON_SECRET` (cron auth), and `NFL_SEASON` (e.g. `2026`).
   See `.env.example`. For local dev put these in `.env`.
5. `npm run migrate` — creates the tables and seeds the entries (Jon, Genevieve, Elliot).
   To change entries, edit `src/lib/entries.ts` and the seed in `src/lib/db/schema.sql`.
6. `npm run dev`, then open `http://localhost:3000/?pw=YOUR_PASSWORD`.
7. Load data on first run: `curl -X POST http://localhost:3000/api/refresh`
   (in production the cron does this automatically).

## Deploy (Vercel)

- Push to your **personal** GitHub, import the repo into your **personal** Vercel account.
- Set the env vars above in the Vercel project (including `CRON_SECRET` — Vercel automatically
  sends `Authorization: Bearer $CRON_SECRET` on cron requests, which `/api/cron/refresh`
  verifies).
- `vercel.json` schedules a data refresh Tue/Thu/Sat at 12:00 UTC.

## How picks work

Each week the dashboard shows a recommended pick per entry. Press **Confirm pick** to record
the team you actually played; the database rejects reusing a team or double-picking a week.
The Splash Sports pool has no public API, so recording your pick is the one manual step —
the same one you did in the sheet.

## Testing

- `npm test` — full unit suite (Vitest).
- `npx tsc --noEmit` — typecheck.
- `npm run build` — production build.
