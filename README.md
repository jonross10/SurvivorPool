# Survivor Pool

A Next.js/Vercel app that recommends weekly NFL survivor-pool picks. Each **entry** picks one
team per week to win; a team can be used at most once, and a single loss eliminates the entry.
The app fetches de-vigged moneyline odds (The Odds API) for the current week and FPI-projected
win probabilities (ESPN) for future weeks, then runs a **season-optimal assignment engine** that
plans a team for every remaining week — so it won't burn a juggernaut on an easy week when a
solid weaker team gets you through and the juggernaut is worth more later. A per-entry **safety
floor** refuses any current-week pick below a chosen win probability, and every recommendation
shows its reasoning plus the greedy (highest-win-probability) alternative.

It is **multi-user** (Google sign-in or passwordless magic link) with per-owner entries, and it
is wired into **Klaviyo** for its messaging layer: an in-app strategy assistant (Klaviyo Customer
Agent), push/email notifications (Klaviyo flows + web push), and a Custom Objects mirror of every
entry and pick.

State lives in **Postgres (Neon)**. `UNIQUE(entry_id, team)` and `UNIQUE(entry_id, week)` enforce
the core survivor rules at the database level.

## Documentation map

- **This file** — overview, setup, deploy, directory map.
- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit: the pure domain engine,
  data sources, the data model, and the request/data flow through the app.
- [`docs/klaviyo.md`](docs/klaviyo.md) — the Klaviyo integration: the Customer Agent assistant,
  Custom Objects sync, notification flows, and web push.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records for choices that aren't obvious from
  the code (dual auth, the pick engine, Klaviyo as the integration spine).

## Directory map

```
src/
  app/                      Next.js App Router
    page.tsx + dashboard-client.tsx   Dashboard (entry cards, current pick)
    grid/  matchups/  plan/  calendar/  settings/  assistant/  signin/
    nav.tsx                 Bottom tab bar
    api/                    Route handlers (JSON:API) — see docs/architecture.md
      auth/[...all]/        Better Auth handler
      entries/  picks/  pick-overrides/  grid/  matchups/  rankings/
      recommendations/  simulate-plan/  schedule/  refresh/  picks-state/
      chat/                 Proxies the in-app assistant to the Klaviyo agent
      push/                 subscribe + send (web push)
      cron/                 refresh · sync-klaviyo · pick-results
  components/               React UI (cards, modals, pills, chat, push toggle)
  lib/
    (pure core)             odds · projection · win-prob · winprob-matrix ·
                            matching · pick-engine · portfolio · recommendations ·
                            elimination · game-views · week · entry-status  (no I/O, unit-tested)
    sources/                espn-schedule · espn-fpi · odds-api · results · ingest
    db/                     Neon client · schema.sql · migrate · repos (entries, picks,
                            users, push, cache, pick-overrides, result-notifications)
    auth.ts · session.ts · agent-auth.ts   Better Auth + dual-auth resolution
    klaviyo.ts · klaviyo-http.ts · klaviyo-objects.ts   Klaviyo integration
    jsonapi.ts · jsonapi-client.ts · api-client.ts      JSON:API helpers
  middleware.ts             Page gate (redirects sessionless visitors to /signin)
scripts/
  provision-agent.ts        Provisions the Klaviyo Customer Agent (tools + skill)
tests/                      Vitest suites mirroring src/lib + captured fixtures
docs/                       Architecture notes + ADRs (see above)
```

## Setup

1. `npm install`
2. Create a free **Neon** Postgres project; set `NEON_DB_CONNECTION_URL`.
3. Get a free key at **the-odds-api.com**; set `ODDS_API_KEY`.
4. Configure **Better Auth**: set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
   `BETTER_AUTH_URL` (`http://localhost:3000` locally), and Google OAuth credentials
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. For Klaviyo features set `KLAVIYO_API_KEY`, the VAPID web-push keys
   (`npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`), and `API_KEY` (the shared key the Klaviyo agent authenticates with).
6. Set `CRON_SECRET` (cron auth) and `NFL_SEASON` (e.g. `2026`). See `.env.example`; for local
   dev put everything in `.env.local`.
7. `npm run migrate` — creates all tables (Better Auth + app). Entries are created per user
   through the app, not seeded.
8. `npm run dev`, open `http://localhost:3000`, and sign in. Load data on first run:
   `curl -X POST -H "X-API-Key: $API_KEY" "http://localhost:3000/api/refresh?userId=<your-id>"`
   (in production the cron does this automatically).

> **Local dev gotcha:** never run `npm run build` while `npm run dev` is up — it corrupts `.next`.

## Deploy (Vercel)

- Import the repo into Vercel; set every env var above in the project (Vercel sends
  `Authorization: Bearer $CRON_SECRET` on cron requests, which the cron routes verify).
- `vercel.json` schedules (UTC): a data **refresh** daily, a **sync-klaviyo** reconcile daily,
  and **pick-results** notifications across six slots covering the Thu/Sun/Mon/Tue game windows.
  See [`docs/klaviyo.md`](docs/klaviyo.md) for what each cron does.

## How picks work

Each week the dashboard shows a recommended pick per entry. Press **Confirm pick** to record the
team you actually played; the database rejects reusing a team or double-picking a week. The pool
has no public API, so recording your pick is the one manual step. The strategy assistant (chat)
can answer questions, run what-if projections, and make picks on your behalf after you confirm.

## Testing

- `npm test` — full unit suite (Vitest).
- `npx tsc --noEmit` — typecheck.
- `npm run build` — production build (don't run while `dev` is up).
