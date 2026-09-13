# Interface Expansion + JSON:API Migration — Design

**Date:** 2026-09-13
**Status:** Approved (pending spec review)
**Builds on:** the shipped Survivor Pool app (`master`). All data is already cached in
Postgres (`schedule`, `fpi`, `odds`); these are new *views* + an API-contract change, with
no new external fetching.

## Goals

1. **Matchups page** (`/matchups`) — a research + pick screen combining "this week's
   matchups", "the Odds API odds", and "pick a team that wasn't suggested" into one screen
   modeled on the Splash "Make picks" UI.
2. **Calendar page** (`/calendar`) — a team × week opponent grid for the whole season.
3. **Undo/change a pick** — a delete path so mis-clicks and pre-kickoff strategy changes are
   fixable.
4. **JSON:API** — migrate every API endpoint (existing + new) to the
   [JSON:API](https://jsonapi.org/) contract, pragmatic compliance.

## JSON:API Conventions (pragmatic subset)

A shared `src/lib/jsonapi.ts` is the single source of the contract. We adopt:

- **Top-level document:** `{ data }` on success, `{ errors }` on failure, optional `meta`.
- **Resource object:** `{ type, id, attributes }`. (No `relationships`/`included`/sparse
  fieldsets in v1 — resources are self-contained; YAGNI. Easy to add later.)
- **Content-Type:** every API response sets `application/vnd.api+json`.
- **Errors:** `{ errors: [{ status, title, detail? }] }`.
- **Request bodies** for writes are JSON:API too: `{ data: { type, attributes } }`.
- **Meta-only documents** (e.g. refresh result) are allowed by the spec and used where there
  is no natural resource.

### `src/lib/jsonapi.ts` (shape)

```ts
export interface ResourceObject<A> { type: string; id: string; attributes: A; }
export interface JsonApiError { status: string; title: string; detail?: string; }

export function resource<A>(type: string, id: string, attributes: A): ResourceObject<A>;
export function document<A>(
  data: ResourceObject<A> | ResourceObject<A>[],
  meta?: Record<string, unknown>,
): { data: ...; meta?: ... };
export function metaDocument(meta: Record<string, unknown>): { meta: ... };
export function errorDocument(errors: JsonApiError[]): { errors: JsonApiError[] };

// Next.js helper: sets status + Content-Type application/vnd.api+json.
export function jsonApi(body: unknown, status = 200): NextResponse;
```

## Resource Types & Endpoints

| Method & path | Resource `type` | `id` | `attributes` | `meta` |
|---|---|---|---|---|
| `GET /api/recommendations?floor=` | `recommendation` | entry id | `{ entry, week, pick, prob, reasoning, greedyAlt, projectedPath }` | `{ currentWeek, floor }` |
| `GET /api/matchups?week=N` | `game` | `${week}:${away}@${home}` | `{ week, home, away, kickoff, homeOdds, awayOdds, homeProb, awayProb, source }` | `{ currentWeek, weeks }` |
| `GET /api/schedule` | `game` | `${week}:${away}@${home}` | `{ week, home, away, kickoff }` | `{ weeks }` |
| `GET /api/picks-state` | `entry` | entry id | `{ name, usedTeams, picksByWeek }` | `{ currentWeek }` |
| `GET /api/grid?entry=` | `winprob` | `${week}:${team}` | `{ week, team, opponent, home, prob, source }` | `{ week, entry }` |
| `GET /api/log` | `pick` | `${entryId}:${week}` | `{ entry, week, team }` | — |
| `POST /api/pick` | `pick` (req + res) | `${entryId}:${week}` | `{ entry, week, team, winProb }` | — |
| `DELETE /api/pick` | `pick` (req) | — | request `{ entry, week }` → `metaDocument({ deleted: true })` | — |
| `POST /api/refresh` | — | — | `metaDocument({ ok: true, refreshedAt })` | — |
| `GET /api/cron/refresh` | — | — | unchanged bearer-gated; `metaDocument({ ok: true })` | — |

**Error mapping:** unknown entry → `400`; pick UNIQUE violation (team reused / week already
picked) → `409` with a clear `detail`; delete of a nonexistent pick → still `200`
`metaDocument({ deleted: false })` (idempotent). The password-gate middleware is unchanged
(it gates HTML pages too), so its `401` stays plain text.

## New Pages

### `/matchups`
- **Week tabs** W1–W`maxScheduledWeek`, defaulting to `currentWeek`.
- **Entry tabs** Jon / Genevieve / Elliot (the active entry for picking).
- Games **grouped by day** (from `kickoff`), each game card shows both teams with:
  - raw consensus American line (e.g. `BUF −310`),
  - de-vigged win % (e.g. `76%`),
  - a small badge for `source` (`odds` vs `fpi` fallback).
- **Picking:** clicking a team records the active entry's pick for the selected week
  (`POST /api/pick`). The app's **suggested pick** (from `/api/recommendations`) is
  highlighted; **already-used teams** (from `/api/picks-state`) are greyed/disabled; the
  **current recorded pick** shows a check + an **Undo** control (`DELETE /api/pick`).
- After any pick/undo, re-fetch `picks-state` + `recommendations` so the UI stays in sync.

### `/calendar`
- Rows = 32 teams, columns = W1–W18. Each cell = that week's opponent: `OPP` (home,
  green tint) / `@OPP` (away, grey) / blank (BYE). Built client-side from `GET /api/schedule`.
- An entry selector optionally dims teams that entry has already used (`/api/picks-state`).

### Shared nav
A small `<Nav>` component (`Dashboard · Matchups · Calendar · Grid · Log`) rendered on every
page, replacing the current ad-hoc footer links.

## Pure Core Additions (unit-tested)

- **`buildGameViews(schedule, strengths, odds, week): GameView[]`** in
  `src/lib/game-views.ts` — one row per game for the week with both sides' raw odds +
  de-vigged prob + `source` (`odds` when a posted line exists, else `fpi` via
  `projectWinProb`). Mirrors `buildWinProbs`; reuses `devigTwoWay`/`projectWinProb`.
  `GameView` type added to `types.ts`.
- **`removePick(entryId, week)`** in `picks-repo.ts` — `DELETE FROM picks WHERE entry_id
  AND week`; returns whether a row was removed.
- **`jsonapi.ts` helpers** — `resource`/`document`/`metaDocument`/`errorDocument` unit-tested
  for shape.

## Client Changes

- `dashboard-client.tsx`, `grid/page.tsx`, `log/page.tsx` updated to parse the JSON:API
  envelope (`res.data.map(r => r.attributes)`, read `meta`). A tiny client helper
  `unwrap(doc)` returning attributes keeps this DRY.
- New `matchups/page.tsx` and `calendar/page.tsx` consume JSON:API from the start.
- All client `fetch`es for writes send `{ data: { type, attributes } }` with
  `Content-Type: application/vnd.api+json`.

## Testing

- `jsonapi.test.ts` — resource/document/error/meta document shapes + that `jsonApi()` sets
  the content type and status.
- `game-views.test.ts` — odds-vs-FPI selection, both sides present, bye/omission, week filter
  (mirrors the existing `winprob-matrix` tests).
- `picks-repo.test.ts` — extend the pure portion; DB-level delete verified manually against
  Neon (same pattern as the existing constraint check).
- Existing suite must stay green; endpoints re-verified via `next build` + a live local
  smoke check of the new pages.

## Out of Scope (v1 / YAGNI)

- JSON:API `relationships`, `included`, sparse fieldsets, pagination.
- Per-sportsbook odds breakdown (cache stores the consensus average; 1 request/refresh).
- Team logos (abbreviations only), live scores, pick-lock timers (Splash is source of truth).
