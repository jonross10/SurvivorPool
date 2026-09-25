# Portfolio Strategy Engine & Season Projection — Design

**Date:** 2026-09-25
**Status:** Approved (pending spec review)

## Problem

The recommender optimizes each entry independently. For someone managing several
entries in one pool, that's suboptimal: entries can pile onto the same team (one
upset wipes several), and there's no season-wide view of the plan. We want a
**portfolio strategy engine** that plans all entries together — diversifying picks
while still saving strong teams for the weeks they matter — and a **season
projection view** that maps out every entry's planned picks, updating each week.

## Goals

1. Plan all alive entries jointly to maximize the chance **at least one survives**,
   by diversifying (distinct team per entry per week) without burning a strong team
   early when a merely-competent team would do.
2. Drive the weekly recommendation (dashboard/grid/matchups) from this same plan, so
   single-week advice matches the season plan.
3. A season **projection matrix** (entries × weeks) showing each entry's path,
   with past weeks as actual results and future weeks as the plan.
4. Let the user click any cell to lock/swap that pick.

## Non-Goals

- Full Monte-Carlo / ILP season optimization (overkill for 3–4 entries).
- A prediction/ML model — win probabilities still come from odds/FPI.
- **Opponent modeling** (predicting what rival entrants you don't control will pick,
  for contrarian EV in large pools). The pool concept below is a prerequisite, but
  modeling external opponents' picks is a separate future feature.

## Key Decisions

### Portfolio objective, not per-entry

The engine maximizes portfolio survival (≥1 entry alive). Diversification is the
lever: distinct teams across entries in a week make outcomes uncorrelated, so
`P(all lose) = ∏(1 − pᵢ)` shrinks fast (four 75% picks on different games ⇒ ~99.6%
that one survives, vs 75% if all ride the same team).

### Pools: diversify only within a pool

Each entry belongs to a **pool** (stored in the existing `entries.settings` JSONB as
`settings.pool`, default `"main"`). The portfolio planner runs **per pool** — entries
in the same pool are coordinated/diversified together; entries in different pools are
planned independently of one another. Marking an entry as its own pool therefore makes
its recommendations fully independent (per-entry optimal, no de-collision) — exactly the
"separate pool" behavior. This also lays the groundwork for later opponent modeling
(adding rival entries to a pool). No cross-pool assumption is needed anymore; the pool
is the coordination boundary.

### Planner: per-entry season-optimal + cross-entry de-collision (A + B)

The existing single-entry optimizer already does season-long **stud-saving**: its
`projectedPath` is a max-weight assignment over weeks × teams maximizing the product
of win probs, so it won't spend a uniquely-strong team in a week a 70% team suffices.
We keep that and add diversification as a layer:

1. **Per-entry optimal path** — run the global assignment for each alive entry
   (excluding its used teams). Gives stud-saving for free.
2. **De-collide** — find a (week, team) assigned to ≥2 entries. Keep it for the entry
   that *needs it most* (largest gap between that team's win prob and its next-best
   available team **that week**); a locked pick always wins. Forbid that (week, team)
   for the other entries and **re-run their optimizer** so they re-plan optimally
   around the constraint.
3. Repeat until no collisions (bounded; each step forbids one more cell).

Story: *"everyone gets their season-optimal plan; when two want the same team the
same week, the one who needs it more keeps it and the other re-plans."*

## Components

### 1. `src/lib/portfolio.ts` (pure, unit-tested)

```ts
import type { WinProb, PathEntry } from "./types";

export interface EntryPlanInput {
  entry: string;
  winProbs: WinProb[];               // per-entry (already excludes used teams)
  lockedByWeek: Record<number, string>; // weeks already picked (fixed constraints)
}

export interface EntryPlan {
  entry: string;
  path: PathEntry[];                 // one team per remaining week (week, team, prob)
}

export function planPortfolio(
  entries: EntryPlanInput[],
  currentWeek: number,
  safetyFloor: number,
): EntryPlan[];
```

Internals:
- `planEntry(input, forbidden: Set<"week:team">): PathEntry[]` — extracts the existing
  assignment logic (`maxWeightAssignment` over weeks × teams of `log(prob)`), with two
  additions: cells in `forbidden` and weeks conflicting with `lockedByWeek` are set to
  `-Infinity`, and each `lockedByWeek` week is forced to its team.
- `planPortfolio` loops: plan all entries → detect the first collision → assign a keeper
  (locked > largest week-local prob gap) → add the (week, team) to the losers' `forbidden`
  → re-plan. Cap iterations at `entries × weeks` as a safety bound.
- **Safety floor** applies to each entry's *current-week* team only: if the planned
  current-week pick is below the floor, swap to the safest available team ≥ floor for
  that entry that week (same rule as today), then treat that as its current pick.

This replaces the collision-blind, per-entry `recommend()` path-building. The existing
`recommend()` reasoning/greedyAlt logic is folded in or simplified (reasoning becomes
portfolio-aware, e.g. "diversified pick; SF held for Archie's Week 6").

### 2. Wire into `buildRecommendations` (`src/lib/recommendations.ts`)

Build per-entry `winProbs` (via `buildWinProbs` with each entry's used set) and
`lockedByWeek` (from picks). **Group entries by `settings.pool` (default `"main"`) and
call `planPortfolio` once per pool**, so coordination/diversification happens only within
a pool. Map results to the existing `Recommendation` shape per entry: `pick` = plan's
current-week team, `prob` = its win prob, `projectedPath` = the plan, `reasoning` =
portfolio note. No change to the recommendations route or its consumers — `projectedPath`
and `pick` just become portfolio-aware, so dashboard/grid/matchups update automatically.

### 3. Portfolio survival helper (`src/lib/portfolio.ts`)

```ts
// P(≥1 entry still alive) at the end of each listed week, assuming week/entry
// independence (a reasonable approximation once picks are diversified).
export function survivalCurve(plans: EntryPlan[], throughWeeks: number[]): { week: number; prob: number }[];
```
`P(entry alive through W) = ∏ weekly probs (current..W)`; `P(≥1) = 1 − ∏ₑ(1 − that)`.

### 4. Shared pick-modal hook (`src/components/use-pick-modal.tsx`)

Both the dashboard and the new plan view need the same modal wiring, so extract it:
owns `pickModal`/`modalWps` state and `openPickModal`, `pickForWeek`, `clearWeek`,
`overrideWeek`, `clearOverrideWeek` (all already in `dashboard-client.tsx`), plus the
`<PickModal/>` render. Takes a `reload` callback. Dashboard refactors to use it; the
plan view reuses it. (DRY improvement that falls out of adding the second consumer.)

### 5. Projection view (`src/app/plan/page.tsx` + nav item "Plan")

- Fetches `/api/recommendations` (per-entry `projectedPath`, `picksByWeek`,
  `resultsByWeek`, `eliminated`, `week`) and `/api/matchups` (for the pick modal), like
  the dashboard.
- **Matrix:** rows = entries, columns = weeks (W1…W18), horizontally scrollable, sticky
  entry-name column (mirrors Calendar/Grid).
- **Cells:**
  - Past weeks → actual pick: team logo + abbr, shaded green/red by result (reuse the
    outcome coloring), score on hover.
  - Current/future weeks → projected team: logo + abbr + **win %**.
  - Eliminated entry rows → greyed, "out".
  - Empty/bye → blank.
  - Every cell is clickable → opens the shared PickModal for that entry+week (lock/swap).
- **Portfolio survival line** at top: `survivalCurve` for a short horizon
  (e.g. next 4–6 weeks), e.g. "P(≥1 alive) · W4 96% · W6 89% · W8 80%".

### 6. Pool editing (small UI)

`settings.pool` is editable per entry via the existing `updateEntrySettings` path — a
compact inline field on the `EntryCard` (next to the `tie=safe` toggle), defaulting to
`"main"`. Entries default to the same pool, so behavior is unchanged until pools are set.

## Data Flow

`/api/recommendations` → `buildRecommendations` → group entries by pool → `planPortfolio`
per pool → each entry's `projectedPath` (portfolio-diversified, stud-saving). Dashboard/
grid/matchups read the current-week `pick`; the plan view renders the full `projectedPath`
matrix. Clicking a cell → PickModal → `/api/pick` → reload.

## Recompute Cadence

Recommendations are **recomputed on every request** — `buildRecommendations` (and thus
`planPortfolio`) runs live on each `/api/recommendations` call, reading the currently
cached odds/FPI/schedule. Those inputs refresh ~daily via the cron (16:00 UTC) plus
manual "Refresh stats" (hourly-throttled). So recs always reflect the latest data on
each load, while the underlying data moves about once a day. Per-request planning is
cheap for a handful of entries; if it ever becomes heavy (many entries/pools), the plan
output can be cached and invalidated on refresh/pick — noted as a future escape hatch,
not built now.

## Testing

`planPortfolio` (pure) gets thorough unit tests:
- de-collision: two entries wanting the same team the same week end up on different teams;
- keeper priority: locked pick wins; otherwise the entry with the weaker next-best keeps it;
- used teams and byes respected; no team repeats within an entry;
- stud-saving preserved: a uniquely-strong-later team isn't spent early when an adequate
  alternative exists;
- safety floor applies to the current week.
`survivalCurve` gets a couple of arithmetic tests. View/route verified in-browser.

## Assumptions & Risks

- **Pools are the coordination boundary** (via `settings.pool`); `survivalCurve` and
  diversification are computed per pool. Entries left in the default pool are treated as
  competing together.
- **Independence approximation** in `survivalCurve` (diversification keeps correlation low).
- **Greedy de-collision** is a heuristic, not a global optimum; fine for a handful of
  entries per pool and explainable. Full joint optimization is a possible future upgrade.

## Phasing

Single plan; naturally sequenced: (1) `planPortfolio` + `survivalCurve` (pure + tests),
(2) wire into `buildRecommendations` with per-pool grouping, (3) pool field on `EntryCard`,
(4) `usePickModal` hook + dashboard refactor, (5) `/plan` view + nav.
