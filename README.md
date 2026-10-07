# Survivor Pool

A Next.js/Vercel app that picks NFL survivor-pool teams for you each week.

In survivor, each **entry** picks one team per week to win. You can use a team only once. One loss
knocks the entry out. The app pulls de-vigged moneyline odds (The Odds API) for this week and FPI
win probabilities (ESPN) for later weeks, then plans a team for every remaining week at once. It
saves a strong team for a week that needs it instead of spending it on an easy week a weaker team
would also win. A per-entry **safety floor** blocks any pick below a win probability you set. Every
pick shows why, and shows the simple alternative — the highest-probability team this week.

Sign in with Google or a magic link. Each entry has one owner. The app uses **Klaviyo** for
everything it sends: the in-app chat assistant, push and email, and a copy of every entry and pick
as Custom Objects.

State lives in **Postgres (Neon)**. Two unique constraints enforce the rules:
`UNIQUE(entry_id, team)` stops a repeat team, and `UNIQUE(entry_id, week)` stops two picks in a week.

## Docs

- **This file** — what it is, setup, deploy, and the file layout.
- [`docs/architecture.md`](docs/architecture.md) — the layers and how a request flows through them.
- [`docs/klaviyo.md`](docs/klaviyo.md) — the Klaviyo integration.
- [`docs/adr/`](docs/adr/) — why the non-obvious choices were made.

## Layout

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
  provision-agent.ts        Provisions Klaviyo: Customer Agent (tools + skill),
                            the magic-link email template, and notification flows
tests/                      Vitest suites mirroring src/lib + captured fixtures
docs/                       Architecture notes + ADRs (see above)
```

## Setup

1. `npm install`
2. Create a free **Neon** Postgres project. Set `NEON_DB_CONNECTION_URL`.
3. Get a free key at **the-odds-api.com**. Set `ODDS_API_KEY`.
4. Set up **Better Auth**: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL`
   (`http://localhost:3000` locally), and Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. For Klaviyo, set `KLAVIYO_API_KEY`, the VAPID web-push keys
   (`npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`), and `API_KEY` (the shared key the agent uses).
6. Set `CRON_SECRET` and `NFL_SEASON` (e.g. `2026`). See `.env.example`. For local dev, put it all
   in `.env.local`.
7. `npm run migrate` — creates every table. You create entries in the app; none are seeded.
8. `npm run dev`, open `http://localhost:3000`, and sign in. Load data once:
   `curl -X POST -H "X-API-Key: $API_KEY" "http://localhost:3000/api/refresh?userId=<your-id>"`.
   In production the cron does this.

> **Local dev:** don't run `npm run build` while `npm run dev` is up. It corrupts `.next`.

## Deploy (Vercel)

- Import the repo into Vercel and set every env var above. Vercel adds
  `Authorization: Bearer $CRON_SECRET` to cron requests, which the cron routes check.
- `vercel.json` runs two **daily** jobs (UTC): a data **refresh** and a **sync-klaviyo** reconcile.
  [`docs/klaviyo.md`](docs/klaviyo.md) says what each does.

### Notification scheduler (required)

Pick notifications — win/loss plus live halftime and close-game alerts — must run every few minutes
on game day. Vercel's **Hobby** plan runs crons only once a day, so these run on an outside
scheduler. This is a real deploy step, not optional:

- Create a [cron-job.org](https://cron-job.org) job: **`POST`** `https://<your-app>/api/cron/pick-results`,
  **every 3 minutes**, header `Authorization: Bearer <CRON_SECRET>`.
- On first setup, call it once with `?seed=1`. This marks already-final games as notified so it
  doesn't send a backlog of old results.
- Check it anytime with `GET …/api/cron/pick-results?debug=1` (a read-only report).
- ⚠️ If the job stops, **all pick notifications stop, with no error**. It must be `POST` (a `GET`
  job returns 405). `CRON_SECRET` must match in Vercel, this job's header, and `.env.local`.
  See [`docs/adr/0004-external-scheduler-pick-results.md`](docs/adr/0004-external-scheduler-pick-results.md).

## How picks work

Each week the dashboard shows one recommended pick per entry. Press **Confirm pick** to record the
team you played. The database rejects a repeat team or a second pick in a week. The pool has no
public API, so recording your pick is the one manual step. The chat assistant can answer questions,
run what-if projections, and make picks for you after you confirm.

## Testing

- `npm test` — unit suite (Vitest).
- `npx tsc --noEmit` — typecheck.
- `npm run build` — production build (not while `dev` is up).
