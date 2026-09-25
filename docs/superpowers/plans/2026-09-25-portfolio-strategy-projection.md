# Portfolio Strategy Engine & Season Projection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan all entries in a pool together — diversifying picks while still saving strong teams for their best week — drive the weekly recommendation from that plan, and add a season "projected picks" matrix view.

**Architecture:** Reuse the existing single-entry season optimizer (max-weight assignment over weeks × teams) to get each entry's stud-saving path, then add a cross-entry de-collision layer so entries in the same pool pick distinct teams. The planner feeds `buildRecommendations`, so `projectedPath`/`pick` become portfolio-aware everywhere. A new `/plan` page renders the entries × weeks matrix with click-to-pick.

**Tech Stack:** Next.js 15 (App Router), TypeScript, vitest, Tailwind. Pure logic is unit-tested; routes/UI verified in-browser (repo convention).

**Reference spec:** `docs/superpowers/specs/2026-09-25-portfolio-strategy-projection-design.md`

---

## Phase 1 — Strategy engine (pure lib)

### Task 1: Split `recommend` into `optimalPath` + `recommendFromPath`

**Files:**
- Modify: `src/lib/pick-engine.ts`
- Test: `tests/lib/pick-engine.test.ts` (existing — must stay green)

- [ ] **Step 1: Refactor `pick-engine.ts`, extracting two exported helpers**

Replace the body of `recommend` so it delegates to the new helpers, and export them. The full new file:

```ts
import type { WinProb, Recommendation, PathEntry, TeamAbbr } from "./types";
import { maxWeightAssignment } from "./matching";

export interface EngineOptions {
  safetyFloor: number; // 0..1 minimum acceptable prob for the current-week pick
}

/** Season-optimal one-team-per-week assignment (maximizes the product of win probs). */
export function optimalPath(winProbs: WinProb[]): PathEntry[] {
  const weeks = [...new Set(winProbs.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));
  if (weeks.length === 0 || teams.length === 0) return [];

  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
      const p = probOf.get(`${wk}:${tm}`);
      return p === undefined ? -Infinity : Math.log(p);
    }),
  );
  const assignment = maxWeightAssignment(matrix);
  const path: PathEntry[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const col = assignment[i];
    if (col >= 0) {
      const team = teams[col];
      path.push({ week: weeks[i], team, prob: probOf.get(`${weeks[i]}:${team}`)! });
    }
  }
  return path;
}

/** Derive the current-week pick (with safety-floor override) and reasoning from a path. */
export function recommendFromPath(
  entry: string,
  currentWeek: number,
  path: PathEntry[],
  winProbs: WinProb[],
  opts: EngineOptions,
): Recommendation {
  const currentWeekProbs = winProbs
    .filter((w) => w.week === currentWeek)
    .sort((a, b) => b.prob - a.prob);
  const greedy = currentWeekProbs[0]
    ? { team: currentWeekProbs[0].team, prob: currentWeekProbs[0].prob }
    : null;

  const optimalCurrent = path.find((p) => p.week === currentWeek) ?? null;
  let pick: TeamAbbr | null = optimalCurrent?.team ?? null;
  let prob = optimalCurrent?.prob ?? 0;
  if (optimalCurrent && optimalCurrent.prob < opts.safetyFloor) {
    const safe = currentWeekProbs.find((w) => w.prob >= opts.safetyFloor);
    if (safe) { pick = safe.team; prob = safe.prob; }
  }
  if (!pick) {
    return { entry, week: currentWeek, pick: null, prob: 0, reasoning: "No available teams to pick.", greedyAlt: greedy, projectedPath: path };
  }

  const floorOverride = optimalCurrent !== null && pick !== optimalCurrent.team;
  const saved =
    !floorOverride && optimalCurrent && greedy && optimalCurrent.team !== greedy.team
      ? path.find((p) => p.team === greedy.team)
      : null;

  let reasoning: string;
  if (floorOverride) {
    reasoning =
      `Pick ${pick} (${pct(prob)}) — safety-floor override; optimal ${optimalCurrent!.team} ` +
      `(${pct(optimalCurrent!.prob)}) was below the ${pct(opts.safetyFloor)} floor.`;
  } else if (saved) {
    reasoning = `Pick ${pick} (${pct(prob)}); saving ${saved.team} for Week ${saved.week} (${pct(saved.prob)}).`;
  } else {
    reasoning = `Pick ${pick} (${pct(prob)}) — best available this week.`;
  }
  return { entry, week: currentWeek, pick, prob, reasoning, greedyAlt: greedy, projectedPath: path };
}

export function recommend(
  entry: string,
  currentWeek: number,
  winProbs: WinProb[],
  opts: EngineOptions,
): Recommendation {
  const path = optimalPath(winProbs);
  if (path.length === 0) {
    return { entry, week: currentWeek, pick: null, prob: 0, reasoning: "No available teams to pick.", greedyAlt: null, projectedPath: [] };
  }
  return recommendFromPath(entry, currentWeek, path, winProbs, opts);
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
```

- [ ] **Step 2: Run the existing engine tests (must stay green)**

Run: `npx vitest run tests/lib/pick-engine.test.ts`
Expected: PASS (all existing `recommend` tests) — the split preserves behavior.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pick-engine.ts
git commit -m "refactor: split recommend into optimalPath + recommendFromPath"
```

---

### Task 2: `planEntryPath` — optimal path with exclusions + locked-week skipping

**Files:**
- Create: `src/lib/portfolio.ts`
- Test: `tests/lib/portfolio.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/portfolio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planEntryPath } from "@/lib/portfolio";
import type { WinProb } from "@/lib/types";

function wp(week: number, team: string, prob: number): WinProb {
  return { week, team, opponent: "OPP", home: true, prob, source: "fpi" };
}

// Two weeks, teams A (strong both weeks) and B (weak).
const probs: WinProb[] = [
  wp(1, "A", 0.9), wp(1, "B", 0.6),
  wp(2, "A", 0.9), wp(2, "B", 0.5),
];

describe("planEntryPath", () => {
  it("assigns one distinct team per week maximizing the product", () => {
    const path = planEntryPath(probs, new Set(), new Set());
    expect(path.map((p) => p.week)).toEqual([1, 2]);
    expect(new Set(path.map((p) => p.team)).size).toBe(2); // no repeats
  });

  it("skips locked weeks (they are already decided)", () => {
    const path = planEntryPath(probs, new Set(), new Set([1]));
    expect(path.map((p) => p.week)).toEqual([2]);
  });

  it("honors forbidden (week:team) cells", () => {
    const path = planEntryPath(probs, new Set(["1:A"]), new Set());
    const w1 = path.find((p) => p.week === 1)!;
    expect(w1.team).toBe("B"); // A forbidden in week 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: FAIL — module `@/lib/portfolio` not found.

- [ ] **Step 3: Implement `planEntryPath`**

Create `src/lib/portfolio.ts`:

```ts
import type { PathEntry, WinProb } from "./types";
import { maxWeightAssignment } from "./matching";

/**
 * Season-optimal path for one entry over its open (non-locked) weeks, excluding
 * any forbidden `${week}:${team}` cells. Locked weeks are already decided and are
 * left out of the plan.
 */
export function planEntryPath(
  winProbs: WinProb[],
  forbidden: Set<string>,
  lockedWeeks: Set<number>,
): PathEntry[] {
  const weeks = [...new Set(winProbs.map((w) => w.week))]
    .filter((w) => !lockedWeeks.has(w))
    .sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));
  if (weeks.length === 0 || teams.length === 0) return [];

  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
      if (forbidden.has(`${wk}:${tm}`)) return -Infinity;
      const p = probOf.get(`${wk}:${tm}`);
      return p === undefined ? -Infinity : Math.log(p);
    }),
  );
  const assignment = maxWeightAssignment(matrix);
  const path: PathEntry[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const col = assignment[i];
    if (col >= 0) {
      const team = teams[col];
      path.push({ week: weeks[i], team, prob: probOf.get(`${weeks[i]}:${team}`)! });
    }
  }
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio.ts tests/lib/portfolio.test.ts
git commit -m "feat: planEntryPath — per-entry optimal path with exclusions"
```

---

### Task 3: `planPortfolio` — cross-entry de-collision

**Files:**
- Modify: `src/lib/portfolio.ts`
- Modify: `tests/lib/portfolio.test.ts`

- [ ] **Step 1: Append failing tests**

Add to `tests/lib/portfolio.test.ts`:

```ts
import { planPortfolio } from "@/lib/portfolio";

describe("planPortfolio", () => {
  // Both entries would independently want A in week 1 (0.9). They must diverge.
  const base = [
    wp(1, "A", 0.9), wp(1, "B", 0.6),
    wp(2, "A", 0.9), wp(2, "B", 0.5),
  ];

  it("de-collides: two entries end up on different teams in a week", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: base, lockedByWeek: {} },
      { entry: "Y", winProbs: base, lockedByWeek: {} },
    ]);
    const x1 = plans.find((p) => p.entry === "X")!.path.find((p) => p.week === 1)!;
    const y1 = plans.find((p) => p.entry === "Y")!.path.find((p) => p.week === 1)!;
    expect(x1.team).not.toBe(y1.team);
  });

  it("a locked pick wins the collision; the other entry re-plans around it", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: base, lockedByWeek: { 1: "A" } }, // X already took A in W1
      { entry: "Y", winProbs: base, lockedByWeek: {} },
    ]);
    const y1 = plans.find((p) => p.entry === "Y")!.path.find((p) => p.week === 1)!;
    expect(y1.team).toBe("B"); // Y bumped off A
  });

  it("independent entries (no shared teams) keep their optimal picks", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: [wp(1, "A", 0.9)], lockedByWeek: {} },
      { entry: "Y", winProbs: [wp(1, "C", 0.8)], lockedByWeek: {} },
    ]);
    expect(plans.find((p) => p.entry === "X")!.path[0].team).toBe("A");
    expect(plans.find((p) => p.entry === "Y")!.path[0].team).toBe("C");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: FAIL — `planPortfolio` not exported.

- [ ] **Step 3: Implement `planPortfolio`**

Append to `src/lib/portfolio.ts`:

```ts
export interface EntryPlanInput {
  entry: string;
  winProbs: WinProb[];                    // weeks >= currentWeek, excludes used teams
  lockedByWeek: Record<number, string>;   // decided weeks -> team (occupancy + skip)
}

export interface EntryPlan {
  entry: string;
  path: PathEntry[];
}

/** Best alternative win prob for an entry in a week, excluding a given team and forbidden cells. */
function nextBestProb(input: EntryPlanInput, week: number, team: string, forbidden: Set<string>): number {
  return input.winProbs
    .filter((w) => w.week === week && w.team !== team && !forbidden.has(`${week}:${w.team}`))
    .reduce((max, w) => Math.max(max, w.prob), 0);
}

/**
 * Plan all entries in one pool: each gets a season-optimal path, then collisions
 * (same team + week across entries) are resolved by letting the entry that needs it
 * most keep it (a locked pick always wins) and re-planning the others around it.
 */
export function planPortfolio(entries: EntryPlanInput[]): EntryPlan[] {
  const forbidden = new Map<string, Set<string>>(entries.map((e) => [e.entry, new Set<string>()]));
  const lockedWeeks = new Map<string, Set<number>>(
    entries.map((e) => [e.entry, new Set(Object.keys(e.lockedByWeek).map(Number))]),
  );
  const probOf = new Map(
    entries.map((e) => [e.entry, new Map(e.winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]))]),
  );

  const maxIterations = entries.length * 25 + 5;
  let paths: EntryPlan[] = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    paths = entries.map((e) => ({
      entry: e.entry,
      path: planEntryPath(e.winProbs, forbidden.get(e.entry)!, lockedWeeks.get(e.entry)!),
    }));

    // Build occupancy: for each (week, team), who holds it (locked or planned).
    interface Occ { entry: string; locked: boolean; week: number; team: string }
    const occupancy = new Map<string, Occ[]>();
    for (const e of entries) {
      for (const [wStr, team] of Object.entries(e.lockedByWeek)) {
        const week = Number(wStr);
        const key = `${week}:${team}`;
        (occupancy.get(key) ?? occupancy.set(key, []).get(key)!).push({ entry: e.entry, locked: true, week, team });
      }
    }
    for (const pl of paths) {
      for (const p of pl.path) {
        const key = `${p.week}:${p.team}`;
        (occupancy.get(key) ?? occupancy.set(key, []).get(key)!).push({ entry: pl.entry, locked: false, week: p.week, team: p.team });
      }
    }

    // First collision that has at least one non-locked occupant we can bump.
    let collision: Occ[] | null = null;
    for (const occs of occupancy.values()) {
      if (occs.length >= 2 && occs.some((o) => !o.locked)) { collision = occs; break; }
    }
    if (!collision) break;

    const { week, team } = collision[0];
    // Keeper: a locked occupant, else the entry whose next-best that week is weakest.
    const lockedOcc = collision.find((o) => o.locked);
    const keeper = lockedOcc
      ? lockedOcc.entry
      : collision
          .map((o) => {
            const input = entries.find((e) => e.entry === o.entry)!;
            const cur = probOf.get(o.entry)!.get(`${week}:${team}`) ?? 0;
            const gap = cur - nextBestProb(input, week, team, forbidden.get(o.entry)!);
            return { entry: o.entry, gap };
          })
          .sort((a, b) => b.gap - a.gap)[0].entry;

    for (const o of collision) {
      if (!o.locked && o.entry !== keeper) forbidden.get(o.entry)!.add(`${week}:${team}`);
    }
  }
  return paths;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: PASS (all planEntryPath + planPortfolio tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio.ts tests/lib/portfolio.test.ts
git commit -m "feat: planPortfolio — cross-entry de-collision with re-planning"
```

---

### Task 4: `survivalCurve`

**Files:**
- Modify: `src/lib/portfolio.ts`
- Modify: `tests/lib/portfolio.test.ts`

- [ ] **Step 1: Append failing test**

Add to `tests/lib/portfolio.test.ts`:

```ts
import { survivalCurve } from "@/lib/portfolio";

describe("survivalCurve", () => {
  it("P(>=1 alive) combines entries as 1 - product of each entry's failure prob", () => {
    // Two entries, each 50% to win week 1.
    const plans = [
      { entry: "X", path: [{ week: 1, team: "A", prob: 0.5 }] },
      { entry: "Y", path: [{ week: 1, team: "B", prob: 0.5 }] },
    ];
    const curve = survivalCurve(plans, [1]);
    // each survives W1 with 0.5; P(>=1) = 1 - 0.5*0.5 = 0.75
    expect(curve[0].week).toBe(1);
    expect(curve[0].prob).toBeCloseTo(0.75, 6);
  });

  it("compounds across weeks for a single entry", () => {
    const plans = [{ entry: "X", path: [{ week: 1, team: "A", prob: 0.8 }, { week: 2, team: "B", prob: 0.5 }] }];
    const curve = survivalCurve(plans, [2]);
    expect(curve[0].prob).toBeCloseTo(0.4, 6); // 0.8 * 0.5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: FAIL — `survivalCurve` not exported.

- [ ] **Step 3: Implement `survivalCurve`**

Append to `src/lib/portfolio.ts`:

```ts
/** P(at least one entry still alive) at the end of each listed week (independence approximation). */
export function survivalCurve(
  plans: EntryPlan[],
  throughWeeks: number[],
): { week: number; prob: number }[] {
  return throughWeeks.map((week) => {
    const pAllOut = plans.reduce((acc, pl) => {
      const survive = pl.path
        .filter((p) => p.week <= week)
        .reduce((prod, p) => prod * p.prob, 1);
      return acc * (1 - survive);
    }, 1);
    return { week, prob: plans.length === 0 ? 0 : 1 - pAllOut };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/portfolio.test.ts`
Expected: PASS. Also run the full suite: `npx vitest run` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio.ts tests/lib/portfolio.test.ts
git commit -m "feat: survivalCurve — P(>=1 entry alive) by week"
```

---

## Phase 2 — Integration

### Task 5: Portfolio-aware `buildRecommendations` (per-pool)

**Files:**
- Modify: `src/lib/recommendations.ts`
- Modify: `src/app/api/recommendations/route.ts`

- [ ] **Step 1: Rewrite `buildRecommendations` to plan per pool**

Replace `src/lib/recommendations.ts` entirely:

```ts
import type { Matchup, TeamStrength, MoneylineGame, Recommendation, TeamAbbr } from "./types";
import { buildWinProbs } from "./winprob-matrix";
import { recommendFromPath } from "./pick-engine";
import { planPortfolio, type EntryPlanInput } from "./portfolio";
import { currentWeek } from "./week";

export interface EntryPlanContext {
  name: string;
  pool: string;
  used: Set<TeamAbbr>;
  picksByWeek: Record<number, string>;
}

export function buildRecommendations(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  entries: EntryPlanContext[],
  now: Date,
  safetyFloor: number,
): Recommendation[] {
  const week = currentWeek(schedule, now);

  // Per-entry win probs (exclude used teams) and locked (already-picked, current+future) weeks.
  const winProbsByEntry = new Map<string, ReturnType<typeof buildWinProbs>>();
  const lockedByEntry = new Map<string, Record<number, string>>();
  for (const e of entries) {
    winProbsByEntry.set(e.name, buildWinProbs(schedule, strengths, odds, week, e.used));
    lockedByEntry.set(
      e.name,
      Object.fromEntries(
        Object.entries(e.picksByWeek)
          .map(([w, t]) => [Number(w), t] as const)
          .filter(([w]) => w >= week),
      ),
    );
  }

  // Plan each pool independently, then derive each entry's recommendation from its path.
  const recs: Recommendation[] = [];
  const pools = [...new Set(entries.map((e) => e.pool))];
  for (const pool of pools) {
    const poolEntries = entries.filter((e) => e.pool === pool);
    const inputs: EntryPlanInput[] = poolEntries.map((e) => ({
      entry: e.name,
      winProbs: winProbsByEntry.get(e.name)!,
      lockedByWeek: lockedByEntry.get(e.name)!,
    }));
    const plans = planPortfolio(inputs);
    for (const plan of plans) {
      recs.push(recommendFromPath(plan.entry, week, plan.path, winProbsByEntry.get(plan.entry)!, { safetyFloor }));
    }
  }
  return recs;
}
```

- [ ] **Step 2: Update the recommendations route to pass pool context**

In `src/app/api/recommendations/route.ts`, replace the `usedByEntry`/`picksByWeekByEntry` construction and the `buildRecommendations` call. Replace lines that build `usedByEntry`, `picksByWeekByEntry`, and call `buildRecommendations` with:

```ts
  const entryContexts = statuses.map((s) => ({
    name: s.entry.name,
    pool: s.entry.settings.pool ?? "main",
    used: new Set(Object.values(s.picksByWeek)),
    picksByWeek: s.picksByWeek,
  }));
  const picksByWeekByEntry: Record<string, Record<number, string>> = Object.fromEntries(
    statuses.map((s) => [s.entry.name, s.picksByWeek]),
  );

  const recs = buildRecommendations(schedule, strengths, odds, entryContexts, new Date(), safetyFloor);
```

(Keep the rest of the route — `week`, `weeks`, the `data` mapping, and the sort — unchanged; it already reads `r.projectedPath`, `picksByWeekByEntry`, etc.)

- [ ] **Step 3: Verify types compile and existing tests pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all pass (pick-engine, portfolio, others).

- [ ] **Step 4: Verify the API end-to-end**

Ensure the dev server is running (`npm run dev`). Then:

Run: `curl -s 'http://localhost:3000/api/recommendations?safetyFloor=0.6' | python3 -c "import sys,json; d=json.load(sys.stdin); print([(r['attributes']['entry'], r['attributes']['pick'], len(r['attributes']['projectedPath'])) for r in d['data']])"`
Expected: each alive entry has a `pick` and a multi-week `projectedPath`; within a pool, current-week picks should differ across alive entries (diversified).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommendations.ts src/app/api/recommendations/route.ts
git commit -m "feat: portfolio-aware recommendations planned per pool"
```

---

### Task 6: `pool` setting — type, PATCH validation, EntryCard control

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/entries/[id]/route.ts`
- Modify: `src/components/EntryCard.tsx`

- [ ] **Step 1: Add `pool` to `EntrySettings`**

In `src/lib/types.ts`, replace the `EntrySettings` interface:

```ts
export interface EntrySettings {
  ties_survive?: boolean; // absent → treated as true
  pool?: string;          // coordination group; absent → "main"
}
```

- [ ] **Step 2: Validate `pool` in the PATCH route**

In `src/app/api/entries/[id]/route.ts`, add a check after the `ties_survive` validation block (before `await updateSettings(...)`):

```ts
  if ("pool" in settings && (typeof settings.pool !== "string" || settings.pool.trim() === "")) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "pool must be a non-empty string" }]),
      400,
    );
  }
```

- [ ] **Step 3: Add a pool field to `EntryCard`**

In `src/components/EntryCard.tsx`, extend the `Rec.settings` type to include `pool` and add a `onSetPool` prop + input. Change the `settings` field in the `Rec` type to:

```ts
  settings?: { ties_survive?: boolean; pool?: string };
```

Add to the component's prop list (after `onToggleTies`):

```ts
  onSetPool: (rec: Rec, pool: string) => void;
```

In the header controls, right before the `tie=safe` label, add a pool input:

```tsx
          <input
            defaultValue={r.settings?.pool ?? "main"}
            onBlur={(e) => {
              const v = e.target.value.trim() || "main";
              if (v !== (r.settings?.pool ?? "main")) onSetPool(r, v);
            }}
            title="Pool — entries in the same pool are planned together"
            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-600"
          />
```

- [ ] **Step 4: Wire `onSetPool` in the dashboard**

In `src/app/dashboard-client.tsx`, add a handler next to `setTiesSurvive`:

```ts
  async function setPool(r: Rec, pool: string) {
    await updateEntrySettings(r.entryId ?? "", { ...(r.settings ?? {}), pool });
    load();
  }
```

And pass it to `<EntryCard ... onSetPool={setPool} />`.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` → no errors.
In the browser, set one entry's pool to a different value; confirm via `curl -s http://localhost:3000/api/entries` that its `settings.pool` persists, and that entries in different pools no longer diversify against each other.

```bash
git add src/lib/types.ts "src/app/api/entries/[id]/route.ts" src/components/EntryCard.tsx src/app/dashboard-client.tsx
git commit -m "feat: per-entry pool setting (planning coordination boundary)"
```

---

## Phase 3 — UI

### Task 7: Extract `usePickModal` hook; dashboard uses it

**Files:**
- Create: `src/components/use-pick-modal.tsx`
- Modify: `src/app/dashboard-client.tsx`

- [ ] **Step 1: Create the hook**

Create `src/components/use-pick-modal.tsx` (moves the modal state + handlers out of the dashboard):

```tsx
"use client";
import { useState } from "react";
import type { WinProb } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import { recordPick, removePick, setPickOverride, clearPickOverride, errorDetail } from "@/lib/api-client";
import PickModal from "./PickModal";

/** Owns the week pick/override modal and its API calls. `reload` re-fetches page data after a change. */
export function usePickModal(reload: () => void) {
  const [modal, setModal] = useState<{ entry: string; week: number; current?: string } | null>(null);
  const [wps, setWps] = useState<WinProb[]>([]);

  async function open(entry: string, week: number, current?: string) {
    setModal({ entry, week, current });
    setWps([]);
    const doc = await (await fetch(`/api/grid?filter[entry]=${encodeURIComponent(entry)}`)).json();
    setWps(unwrapMany<WinProb>(doc));
  }

  async function pick(entry: string, week: number, team: string, prob: number) {
    if (modal?.current && modal.current !== team) await removePick(entry, week);
    const res = await recordPick(entry, week, team, prob);
    if (!res.ok) alert(await errorDetail(res, "Pick failed"));
    setModal(null);
    reload();
  }
  async function clear(entry: string, week: number) { await removePick(entry, week); setModal(null); reload(); }
  async function override(entry: string, week: number, outcome: "survived" | "out" | "revived") {
    await setPickOverride(entry, week, outcome); setModal(null); reload();
  }
  async function clearOverride(entry: string, week: number) { await clearPickOverride(entry, week); setModal(null); reload(); }

  function render(ranks: Record<string, number>) {
    if (!modal) return null;
    return (
      <PickModal
        entry={modal.entry}
        week={modal.week}
        current={modal.current}
        wps={wps}
        ranks={ranks}
        onClose={() => setModal(null)}
        onClear={clear}
        onPick={pick}
        onOverride={override}
        onClearOverride={clearOverride}
      />
    );
  }

  return { open, render };
}
```

- [ ] **Step 2: Refactor the dashboard to use the hook**

In `src/app/dashboard-client.tsx`:
- Remove the `pickModal`/`modalWps` state, `openPickModal`, `pickForWeek`, `clearWeek`, `overrideWeek`, `clearOverrideWeek` functions, and the inline `<PickModal .../>` render.
- Remove the now-unused imports (`setPickOverride`, `clearPickOverride`, `PickModal`, `WinProb`) — keep the others.
- Add near the top of the component: `const modal = usePickModal(load);`
- Add the import: `import { usePickModal } from "@/components/use-pick-modal";`
- `reviveEntry` no longer calls `overrideWeek` (removed). Replace its last line with a direct override call:
  ```ts
  await setPickOverride(r.entry, r.eliminatedWeek, "revived");
  load();
  ```
  (Re-add `import { setPickOverride } from "@/lib/api-client";` to the api-client import list — keep it.)
- Change `EntryCard`'s `onOpenWeek` to `(r, w) => modal.open(r.entry, w, r.picksByWeek?.[w])`.
- Replace the old `{pickModal && (...)}` block at the end with `{modal.render(ranks)}`.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` → no errors.
In the browser: open a timeline cell on the dashboard → the modal still opens, picks/overrides still work.

```bash
git add src/components/use-pick-modal.tsx src/app/dashboard-client.tsx
git commit -m "refactor: extract usePickModal hook shared by dashboard (and plan view)"
```

---

### Task 8: `/plan` season projection view + nav

**Files:**
- Create: `src/app/plan/page.tsx`
- Modify: `src/app/nav.tsx`

- [ ] **Step 1: Add the nav link**

In `src/app/nav.tsx`, add to the `LINKS` array after the calendar entry:

```ts
  { href: "/plan", label: "Plan" },
```

- [ ] **Step 2: Create the projection page**

Create `src/app/plan/page.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { useRanks } from "@/components/use-ranks";
import { usePickModal } from "@/components/use-pick-modal";

type Rv = { outcome: "won" | "lost" | "tie" | "pending" | "live"; teamScore: number | null; oppScore: number | null };
interface Rec {
  entry: string;
  eliminated?: boolean;
  picksByWeek?: Record<number, string>;
  resultsByWeek?: Record<number, Rv>;
  projectedPath?: { week: number; team: string; prob: number }[];
}

function cellClass(outcome: string | undefined, projected: boolean): string {
  if (outcome === "won" || outcome === "tie") return "bg-emerald-50 border-emerald-300";
  if (outcome === "lost") return "bg-red-50 border-red-300";
  if (outcome === "live") return "bg-amber-50 border-amber-300";
  return projected ? "bg-blue-50/40 border-blue-100" : "border-slate-100";
}

export default function PlanPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [survival, setSurvival] = useState<{ week: number; prob: number }[]>([]);
  const ranks = useRanks();

  const load = useCallback(async () => {
    const doc = await (await fetch("/api/recommendations?safetyFloor=0.6")).json();
    const list: Rec[] = (doc.data ?? []).map((d: { attributes: Rec }) => d.attributes);
    setRecs(list);
    setWeeks(doc.meta?.weeks ?? []);
    // Portfolio survival over the next up-to-6 projected weeks (alive entries only).
    const alive = list.filter((r) => !r.eliminated);
    const future = [...new Set(alive.flatMap((r) => (r.projectedPath ?? []).map((p) => p.week)))].sort((a, b) => a - b).slice(0, 6);
    const curve = future.map((week) => {
      const pAllOut = alive.reduce((acc, r) => {
        const s = (r.projectedPath ?? []).filter((p) => p.week <= week).reduce((prod, p) => prod * p.prob, 1);
        return acc * (1 - s);
      }, 1);
      return { week, prob: alive.length ? 1 - pAllOut : 0 };
    });
    setSurvival(curve);
  }, []);
  useEffect(() => { load(); }, [load]);

  const modal = usePickModal(load);

  function cellFor(r: Rec, w: number): { team?: string; outcome?: string; projected: boolean; score?: string } {
    const picked = r.picksByWeek?.[w];
    if (picked) {
      const rv = r.resultsByWeek?.[w];
      const score = rv && rv.teamScore != null && rv.oppScore != null && rv.outcome !== "pending" ? `${rv.teamScore}–${rv.oppScore}` : undefined;
      return { team: picked, outcome: rv?.outcome, projected: false, score };
    }
    const proj = r.projectedPath?.find((p) => p.week === w);
    return proj ? { team: proj.team, projected: true } : { projected: false };
  }

  return (
    <main className="mx-auto max-w-none px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Projected Picks</h1>
      {survival.length > 0 && (
        <p className="mt-1 text-sm text-slate-500">
          Portfolio P(≥1 alive):{" "}
          {survival.map((s) => <span key={s.week} className="mr-3"><strong className="text-slate-800">W{s.week}</strong> {Math.round(s.prob * 100)}%</span>)}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-slate-200 bg-slate-50 px-3 py-1 text-left font-semibold">Entry</th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[56px] border-b border-slate-200 px-2 py-1 font-medium text-slate-500">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.entry} className={r.eliminated ? "opacity-50" : ""}>
                <td className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-slate-200 bg-white px-3 py-1 font-semibold">
                  {r.entry}{r.eliminated ? " (out)" : ""}
                </td>
                {weeks.map((w) => {
                  const c = cellFor(r, w);
                  const proj = r.projectedPath?.find((p) => p.week === w);
                  return (
                    <td
                      key={w}
                      onClick={() => modal.open(r.entry, w, r.picksByWeek?.[w])}
                      title={proj ? `${Math.round(proj.prob * 100)}% projected` : c.score}
                      className={`cursor-pointer border-b border-r px-1 py-1 text-center align-top hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-slate-900 ${cellClass(c.outcome, c.projected)}`}
                    >
                      {c.team ? (
                        <div className="flex flex-col items-center">
                          <TeamLogo abbr={c.team} size={18} />
                          <span className="text-[10px] font-semibold">{c.team}</span>
                          {c.score ? <span className="text-[9px] tabular-nums text-slate-500">{c.score}</span>
                            : proj ? <span className="text-[9px] text-slate-400">{Math.round(proj.prob * 100)}%</span> : null}
                        </div>
                      ) : (
                        <span className="text-slate-300">+</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Past = actual result (green win / red loss). Future = projected plan with win %. Click a cell to pick.</p>
      {modal.render(ranks)}
    </main>
  );
}
```

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:3000/plan`. Confirm: matrix of entries × weeks; past weeks show actual picks shaded green/red with scores; future weeks show projected team + win %; eliminated entries greyed; the survival line shows percentages; clicking a cell opens the pick modal and a pick updates the matrix.

- [ ] **Step 4: Commit**

```bash
git add src/app/plan/page.tsx src/app/nav.tsx
git commit -m "feat: /plan season projection matrix with click-to-pick and survival line"
```

---

## Self-Review Notes

- **Spec coverage:** portfolio planner A+B (T2/T3), per-pool grouping (T5), stud-saving preserved via `optimalPath` reuse (T1/T2), drives weekly recs (T5), pool setting + UI (T6), `usePickModal` extraction (T7), `/plan` matrix with click-to-pick + win% + survival line (T8), survival curve (T4). Recompute-on-request is unchanged (route still runs live).
- **Type consistency:** `EntryPlanInput`/`EntryPlan`/`EntryPlanContext`, `planEntryPath(winProbs, forbidden, lockedWeeks)`, `planPortfolio(entries)`, `survivalCurve(plans, throughWeeks)`, `optimalPath`/`recommendFromPath`, `EntrySettings.pool` are used consistently across tasks.
- **Reused, not duplicated:** `maxWeightAssignment`, `buildWinProbs`, `PickModal`, `TeamLogo`, `useRanks`, `api-client` helpers. The `/plan` survival calc mirrors `survivalCurve`'s formula on the client from `projectedPath` (the lib version is unit-tested; the page recomputes from the API payload to avoid a new endpoint).
- **Locked/used handling:** current+future already-picked weeks are passed as `lockedByWeek` (occupancy + skip); past weeks are excluded by `buildWinProbs` already.
