# Entry Elimination & Pick Scores — Design

**Date:** 2026-09-14
**Status:** Approved (pending spec review)

## Problem

There is currently no way to mark a survivor-pool entry as eliminated. The
`entries` table stores only `id` and `name`; nothing in the data model, API, or
UI represents "this entry lost and is out." A survivor pool is fundamentally
about who has been eliminated, so this is a core missing capability.

Additionally, the ESPN scoreboard endpoint we already fetch
(`espn-schedule.ts`) returns each competitor's score, a winner flag, and game
status — all of which the current parser discards. We can surface per-pick
scores (including live, in-progress games) on the dashboard at little extra
cost, and reuse the same data to auto-detect eliminations.

## Goals

1. Auto-detect elimination from real game results, with a manual override.
2. Show each pick's score/result on the dashboard, including in-progress games.
3. Handle tie rules that differ per entry (different leagues, different rules).
4. Correct per-week override semantics: overriding one week's loss must not mask
   a later, separate loss.
5. Visually distinguish won / lost / eliminated in the UI.

## Non-Goals

- Backfilling historical seasons.
- Automatic background polling of live scores (short server-side cache only).
- A general league/settings admin surface beyond what's needed here.

## Key Decisions

### Derive elimination, don't store it (Approach A)

Elimination status is **computed on every request** from three inputs:

- the entry's picks (existing `picks` table),
- game results (`results` cache),
- manual per-week overrides + the entry's tie rule (new state).

Only those inputs are persisted. Elimination itself is never written to the DB,
so it cannot drift out of sync with the scores shown next to it, and there is no
writer/job to maintain. (Rejected alternative: persisting an `eliminated_week`
column updated by a refresh job — stateful, can go stale, can disagree with the
displayed scores.)

### Overrides are per-week, not per-entry

A single "force alive" boolean is wrong: if an entry loses in Week 3, is
overridden to continue, then loses again in Week 5, a boolean would keep them
looking alive forever.

Instead, overrides are keyed by `(entry, week)` and force that week's outcome to
`survived` or `out`. Derivation walks weeks ascending; for each week the outcome
is `override[week] ?? auto(pick, result, ties_survive)`, and the entry is
eliminated at the **first** week whose resolved outcome is a loss.

- Lose W3 → override W3 = `survived` → continue. Lose W5, no override →
  auto-eliminated at W5. The W3 override never masks the W5 loss. ✅
- `out` overrides also cover games we cannot auto-detect ("I just know they're
  done").

### Tie rules are per-entry, stored in a JSON settings column

Entries span two leagues with opposite tie rules (3 entries: tie survives;
1 entry: tie eliminates). Rather than a dedicated column, `entries` gets a
flexible `settings JSONB` column so future per-entry settings are easy to add.

Tie behavior lives at `settings.ties_survive`, **defaulting to `true`** when
absent (matches the majority league).

## Data Model

### `entries` — add settings column

```sql
ALTER TABLE entries ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';
```

`settings` shape (all keys optional):

```ts
interface EntrySettings {
  ties_survive?: boolean; // absent → treated as true
}
```

### `pick_overrides` — new table

```sql
CREATE TABLE IF NOT EXISTS pick_overrides (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  week     INTEGER NOT NULL,
  outcome  TEXT NOT NULL CHECK (outcome IN ('survived', 'out')),
  PRIMARY KEY (entry_id, week)
);
```

### `results` — new cache key

Stored via the existing `cache` table (`getCache`/`setCache`). Payload is
`GameResult[]` spanning all fetched weeks.

## Types (`src/lib/types.ts`)

```ts
export interface GameResult {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string;            // ISO
  homeScore: number | null;   // null until the game has started
  awayScore: number | null;
  winner: TeamAbbr | null;    // null = tie (if completed) or not yet final
  completed: boolean;         // status.type.completed
  inProgress: boolean;        // status.type.state === "in"
  statusDetail: string;       // e.g. "Q3 5:22", "Final", "Sun 1:00 PM"
}

export type PickOutcome = "won" | "lost" | "tie" | "pending" | "live";

export interface EntrySettings { ties_survive?: boolean; }

// Entry gains settings:
export interface Entry { id: string; name: string; settings: EntrySettings; }
```

## Components

### 1. ESPN results parser (`src/lib/sources/espn-schedule.ts`)

Extend parsing to keep the fields currently discarded. Add a
`parseResults(data, week): GameResult[]` and `fetchWeekResults(week, season)`.
Source fields on each ESPN competitor/competition:

- `competitor.score` → `homeScore` / `awayScore`
- `competitor.winner` (boolean) → `winner`
- `competition.status.type.completed` → `completed`
- `competition.status.type.state` (`"pre"|"in"|"post"`) → `inProgress`
- `competition.status.type.shortDetail` → `statusDetail`

The existing `parseScoreboard` (matchups) stays; `parseResults` reads the same
payload. A tie is `completed === true && winner === null` with equal scores.

### 2. Results fetch & cache (`src/lib/sources/results.ts` or in `ingest.ts`)

`getResultsFresh(currentWeek, season): Promise<GameResult[]>`:

- Read the `results` cache.
- Past **completed** weeks are final — retained as-is.
- If the current week is missing or its cache entry is >60s old and still has
  non-final games, refetch just the current week via `fetchWeekResults`, merge
  by `(week, home, away)`, and `setCache("results", merged)`.

This is independent of the hourly odds/FPI refresh cooldown.

### 3. Elimination logic (`src/lib/elimination.ts`) — pure, tested

```ts
function outcomeForWeek(
  pick: TeamAbbr,
  result: GameResult | undefined,
  tiesSurvive: boolean,
): PickOutcome;
// no result / not started → "pending"
// inProgress → "live"
// completed & winner === pick → "won"
// completed & tie → tiesSurvive ? "tie" (survives) : "lost"
// completed & other team won → "lost"

function deriveEntryStatus(
  picksByWeek: Record<number, TeamAbbr>,
  results: GameResult[],
  overrides: Record<number, "survived" | "out">,
  tiesSurvive: boolean,
): {
  eliminated: boolean;
  eliminatedWeek: number | null;
  byWeek: Record<number, PickOutcome>; // resolved outcome per picked week
};
```

Resolution per week: `override === "out"` → loss; `override === "survived"` →
survived; else `outcomeForWeek(...)`. `"tie"` counts as survived. Eliminated at
the first week resolving to a loss (`"lost"` or override `"out"`).

### 4. Repos

- `entries-repo.ts`: include `settings` in `fetchEntries`/`createEntry` (default
  `{}`); add `updateSettings(id, settings)`.
- `pick-overrides-repo.ts` (new): `getOverrides(entryId)`, `setOverride(entryId,
  week, outcome)`, `clearOverride(entryId, week)`.

### 5. API

- **`GET /api/recommendations`**: fetch results via `getResultsFresh`, compute
  `deriveEntryStatus` per entry. Add to each recommendation resource:
  `eliminated`, `eliminatedWeek`, and `resultsByWeek` (week → `{ outcome, teamScore,
  oppScore, opponent, statusDetail }`). Eliminated entries are returned but get
  `pick: null` (no suggestion) and are sorted to the bottom.
- **grid / matchups / calendar routes**: exclude eliminated entries from their
  outputs (compute status the same way, or share a helper).
- **`PATCH /api/entries/[id]`**: accept `{ settings }` to toggle `ties_survive`.
- **`/api/pick-override`** (mirrors the `/api/pick` JSON:API pattern):
  - `POST` `{ entry, week, outcome }` → set an override.
  - `DELETE` `{ entry, week }` → clear it (revert to auto).

### 6. UI (`src/app/dashboard-client.tsx`)

- **Eliminated cards**: red border/tint, `Eliminated — Week N` badge, no
  suggested pick / confirm button, sorted to the bottom of the grid.
- **Ties toggle**: a small per-card control writing `settings.ties_survive`.
- **Timeline cells** (existing per-week buttons): shade **green** when that
  week's outcome is won/tie-survived, **red** when lost/out, neutral for
  pending, a distinct "live" style for in-progress; show the score
  (e.g. `24–17`) and status.
- **Overrides**: in the existing per-week pick modal, add "Mark survived" /
  "Mark out" / "Clear override" actions for that entry+week (the modal is
  already scoped to entry + week).

## Testing

Unit tests (vitest):

- `parseResults`: completed win, tie, in-progress, not-started; score/winner
  extraction.
- `outcomeForWeek`: every branch, ties both ways.
- `deriveEntryStatus`: clean survivor, first-loss elimination, override
  `survived` then later real loss (re-eliminates), override `out`, tie-survives
  vs tie-eliminates, live/pending weeks not eliminating.
- results merge/TTL: current week refetched, past final weeks retained.

## Suggested Implementation Phasing

The spec is one unit of work, but naturally sequences:

1. **Results ingest + score display** — parser, `results` cache/fetch, types,
   timeline score chips. Delivers visible value on its own.
2. **Elimination + overrides** — `elimination.ts`, repos, settings column,
   override table/API, card treatment, exclusion from other views.
