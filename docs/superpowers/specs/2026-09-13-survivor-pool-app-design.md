# Survivor Pool App — Design

**Date:** 2026-09-13
**Status:** Approved (pending spec review)

## Background

A revamp of [jonross10/SurvivorPool](https://github.com/jonross10/SurvivorPool). The
original system was an AWS Lambda that used headless Chrome + Selenium to scrape
`vegasinsider.com` (moneylines) and `oddsshark.com` (power rankings), wrote the results
into a Google Sheet via `gspread`, and a Google Apps Script colored/hid rows to help pick.

Problems with the old approach:
- Selenium scraping is brittle and cannot run on Vercel serverless.
- Hardcoded 2019 week-1 date; single hardcoded "Jon" sheet.
- Screen-scraping breaks whenever the source sites change markup.
- The whole workflow lived in a Google Sheet that had to be seeded manually each season.

### Goal

Replace the sheet + Lambda with a single **Vercel web app** that fetches odds and team
strength from proper JSON APIs ("semi-live"), tracks the user's four survivor entries, and
**recommends** each week's pick using a season-aware model — while also surfacing the
underlying data grid so the user can sanity-check.

The user runs **4 entries** ("Jon 1–4") in a Splash Sports team-survivor pool.

## Survivor rules (context for the model)

- Each entry picks one NFL team per week.
- Picks are straight-up (no spread). Correct pick → survive; incorrect → eliminated.
- **A team may be used at most once per entry per season.** This is the defining constraint.

## Stack & Hosting

- **Next.js (App Router) + TypeScript**, deployed on **Vercel**.
- **Postgres (Neon free tier)** as the single datastore — durable picks + a cache table.
- **Vercel Cron** refreshes odds/FPI a few times per week; a manual "Refresh now" button
  triggers the same job on demand.
- **Single shared-password gate** (one env var) — the app lives on a public URL and holds
  the user's picks, but full auth is overkill for a single-user tool.

## Data Ingestion (replaces the Selenium Lambda)

A thin, source-swappable ingestion layer. Each source is behind a clean interface so a
source can be replaced without touching the rest of the app.

- **Schedule + team strength — ESPN hidden JSON API** (`site.api.espn.com`):
  - Auto-seeds the **entire season schedule** (home/away, week, kickoff). No manual entry.
  - Pulls **FPI** (Football Power Index) per team for the strength model.
  - ⚠️ **Risk:** the FPI endpoint is unofficial and may change. Fallback = derive strength
    from season-long win-total / championship odds. The strength source is behind an
    interface (`StrengthProvider`) to keep it swappable.
- **Odds — The Odds API** (the-odds-api.com):
  - Current-week moneylines from real sportsbooks as JSON. Free tier ~500 req/month;
    caching keeps usage far below that.
- **Normalization:** team names → standard abbreviations (port the old `team_rename` map).

All fetched data is written to a Postgres `cache` table with a `fetched_at` timestamp so
the UI reads instantly and refreshes are decoupled from page loads.

## Win-Probability Model

- **Current week:** de-vig the moneyline (remove the bookmaker's overround) → true implied
  win probability for each side.
- **Future weeks** (odds not yet posted): project win probability from the **FPI difference
  plus home-field advantage** via a logistic function, for every remaining matchup.

## Pick Engine

**Core — season-optimal assignment.** For each entry independently: assign each still-available
team to at most one remaining week (each week gets exactly one team) to **maximize total
survival probability across the rest of the season** — i.e. maximize `∑ log(winProb)`.
This uses real odds for the current week and FPI projections for later weeks, and is solved
as a max-weight bipartite matching (teams ↔ weeks) on log-probabilities. Re-runs each week
as picks are recorded and data refreshes.

This naturally encodes the user's intuition: it will *not* burn a juggernaut on an easy week
if a solid weaker team clears the bar this week and the juggernaut is more valuable in a
future week where options are thin (the path with higher total survival probability wins).

**Blend controls (transparency layer over the optimizer):**
- **Per-week safety floor:** an adjustable minimum acceptable win probability for the current
  week's pick. The recommendation respects the floor.
- **Reasoning shown:** each recommendation explains itself — e.g. "Pick BUF (92%); saving KC
  for Week 14, its only strong slot."
- **Greedy alternative shown side-by-side:** the highest-win-prob available team this week,
  so the user always sees what the season-optimal choice is trading away.

Output per entry: this week's recommended pick + the full projected path (which teams are
being saved for which weeks) + reasoning + greedy alternative.

## Data Model (Postgres)

Single store; the uniqueness constraint enforces the core survivor rule at the DB level.

- `entries` — one row per entry (Jon 1–4): `id`, `name`.
- `picks` — `id`, `entry_id` (FK), `week`, `team`, `win_prob_at_pick`, `picked_at`.
  - **`UNIQUE(entry_id, team)`** — a team cannot be reused within an entry (the defining rule).
  - **`UNIQUE(entry_id, week)`** — one pick per entry per week.
  - `teamsUsed` for an entry is derived from this table (no separate field to keep in sync).
- `cache` — `key` (e.g. `odds`, `fpi`, `schedule`), `payload` (JSONB), `fetched_at`.

## UI

- **Dashboard:** four entry cards. Each shows this week's recommended pick, win %, one-line
  reasoning, and a "Confirm pick" button that records the actual pick.
- **Grid view:** the live version of the old sheet — teams × weeks, cells heat-colored by
  win probability, used teams greyed out, past weeks dimmed.
- **Pick log:** per-entry record of what was actually picked each week.

⚠️ **Splash Sports has no public API** — the app cannot auto-read the pool. The user records
each week's actual pick in the app (one tap), which updates teams-used. This mirrors the
manual step already done in the sheet today.

## Build Order (independently testable units)

1. **Data fetchers** — ESPN schedule/FPI + The Odds API, behind source interfaces, with
   normalization and the `cache` table.
2. **Win-probability model** — de-vig for current week; FPI-logistic projection for future.
3. **Pick engine** — season-optimal assignment + safety floor + reasoning + greedy alt.
4. **Postgres state** — entries, picks (with constraints), derived teams-used.
5. **UI** — dashboard, grid, pick log.
6. **Cron + auth** — scheduled refresh, manual refresh, password gate.

## Out of Scope (v1 / YAGNI)

- Reading the Splash Sports pool automatically (no public API).
- Pick-popularity / field-contrarian data (pool doesn't expose it).
- Multi-user / whole-league pick tracking (schema leaves room, but not built).
- Real posted odds for future weeks (they don't exist yet; FPI projections stand in).
