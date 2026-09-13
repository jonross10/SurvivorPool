# Survivor Pool App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js/Vercel web app that fetches NFL odds + team strength from JSON APIs, tracks four survivor-pool entries in Postgres, and recommends each week's pick using a season-optimal assignment model.

**Architecture:** Pure-logic core (odds math, FPI win-probability projection, max-weight assignment solver, pick engine) with no I/O, wrapped by an ingestion layer (ESPN + The Odds API behind swappable interfaces) that caches into Postgres, exposed through Next.js API routes and a React UI. Season state lives in Postgres with DB-level uniqueness constraints enforcing survivor rules.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Vitest for tests, `@neondatabase/serverless` for Postgres (Neon), Vercel Cron, deployed on Vercel.

---

## File Structure

```
src/
  lib/
    types.ts                 # shared domain types
    teams.ts                 # team-name normalization + constants
    odds.ts                  # American odds → prob, de-vig
    projection.ts            # FPI-diff → logistic win prob
    matching.ts              # max-weight bipartite assignment solver
    winprob-matrix.ts        # build week×team win-prob matrix for an entry
    pick-engine.ts           # orchestrate: matrix → matching → recommendation
    db/
      client.ts              # neon() client
      schema.sql             # tables + constraints
      migrate.ts             # apply schema.sql
      cache-repo.ts          # get/set cached payloads
      picks-repo.ts          # entries, picks, derived teamsUsed
    sources/
      espn-schedule.ts       # ESPN schedule fetcher → Matchup[]
      espn-fpi.ts            # ESPN FPI fetcher (StrengthProvider)
      odds-api.ts            # The Odds API fetcher → MoneylineGame[]
      ingest.ts              # orchestrate fetch+normalize+cache
  app/
    api/
      recommendations/route.ts
      pick/route.ts
      refresh/route.ts
      cron/refresh/route.ts
    page.tsx                 # dashboard
    grid/page.tsx            # grid view
    log/page.tsx             # pick log
    layout.tsx
  middleware.ts              # password gate
tests/
  lib/ ...                   # mirrors src/lib
  fixtures/                  # captured API JSON
vitest.config.ts
next.config.ts
package.json
vercel.json                 # cron schedule
.env.example
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `next.config.ts`, `.env.example`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialize the Next.js + TypeScript + Vitest project**

Run:
```bash
cd /Users/jonross/SurvivorPool
npm init -y
npm install next@15 react react-dom
npm install -D typescript @types/react @types/node @types/react-dom vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
npm install @neondatabase/serverless
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 4: Write `next.config.ts`, `.gitignore`, `.env.example`**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

`.gitignore`:
```
node_modules
.next
.env
.env.local
*.log
```

`.env.example`:
```
DATABASE_URL=postgres://user:pass@host/db
ODDS_API_KEY=your_the_odds_api_key
APP_PASSWORD=choose_a_password
NFL_SEASON=2026
```

- [ ] **Step 5: Write minimal `src/app/layout.tsx` and `src/app/page.tsx`**

`src/app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main><h1>Survivor Pool</h1></main>;
}
```

- [ ] **Step 6: Add npm scripts to `package.json`**

Add to the `"scripts"` block:
```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"test": "vitest run",
"test:watch": "vitest",
"migrate": "tsx src/lib/db/migrate.ts"
```
Then: `npm install -D tsx`

- [ ] **Step 7: Verify it builds and tests run**

Run: `npx vitest run`
Expected: "No test files found" (exit 0) — the runner works.
Run: `npm run build`
Expected: Next.js build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + TypeScript + Vitest project"
```

---

## Task 2: Domain types + team normalization

**Files:**
- Create: `src/lib/types.ts`, `src/lib/teams.ts`, `tests/lib/teams.test.ts`

- [ ] **Step 1: Write `src/lib/types.ts` (shared types used across the plan)**

```ts
export type TeamAbbr = string; // e.g. "BUF"

export interface Matchup {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string; // ISO
}

export interface TeamStrength {
  team: TeamAbbr;
  fpi: number;
}

export interface MoneylineGame {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  homeOdds: number; // American odds, e.g. -200
  awayOdds: number;
}

export interface WinProb {
  week: number;
  team: TeamAbbr;
  opponent: TeamAbbr;
  home: boolean;
  prob: number; // 0..1
  source: "odds" | "fpi";
}

export interface PathEntry {
  week: number;
  team: TeamAbbr;
  prob: number;
}

export interface Recommendation {
  entry: string;
  week: number;
  pick: TeamAbbr | null;
  prob: number;
  reasoning: string;
  greedyAlt: { team: TeamAbbr; prob: number } | null;
  projectedPath: PathEntry[];
}
```

- [ ] **Step 2: Write the failing test `tests/lib/teams.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizeTeam, TEAMS } from "@/lib/teams";

describe("normalizeTeam", () => {
  it("maps full names to abbreviations", () => {
    expect(normalizeTeam("Green Bay")).toBe("GB");
    expect(normalizeTeam("N.Y. Giants")).toBe("NYG");
    expect(normalizeTeam("NY Giants")).toBe("NYG");
    expect(normalizeTeam("Kansas City")).toBe("KC");
  });
  it("passes through valid abbreviations", () => {
    expect(normalizeTeam("BUF")).toBe("BUF");
  });
  it("throws on unknown input", () => {
    expect(() => normalizeTeam("Narnia")).toThrow();
  });
  it("TEAMS has 32 entries", () => {
    expect(TEAMS.length).toBe(32);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/teams.test.ts`
Expected: FAIL — cannot find module `@/lib/teams`.

- [ ] **Step 4: Write `src/lib/teams.ts`**

```ts
import type { TeamAbbr } from "./types";

export const TEAMS: TeamAbbr[] = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

const NAME_TO_ABBR: Record<string, TeamAbbr> = {
  "Arizona":"ARI","Atlanta":"ATL","Baltimore":"BAL","Buffalo":"BUF",
  "Carolina":"CAR","Chicago":"CHI","Cincinnati":"CIN","Cleveland":"CLE",
  "Dallas":"DAL","Denver":"DEN","Detroit":"DET","Green Bay":"GB",
  "Houston":"HOU","Indianapolis":"IND","Jacksonville":"JAC","Kansas City":"KC",
  "Las Vegas":"LV","Oakland":"LV","L.A. Chargers":"LAC","LA Chargers":"LAC",
  "Los Angeles Chargers":"LAC","L.A. Rams":"LAR","LA Rams":"LAR",
  "Los Angeles Rams":"LAR","Miami":"MIA","Minnesota":"MIN","New England":"NE",
  "New Orleans":"NO","N.Y. Giants":"NYG","NY Giants":"NYG","New York Giants":"NYG",
  "N.Y. Jets":"NYJ","NY Jets":"NYJ","New York Jets":"NYJ","Philadelphia":"PHI",
  "Pittsburgh":"PIT","San Francisco":"SF","Seattle":"SEA","Tampa Bay":"TB",
  "Tennessee":"TEN","Washington":"WAS",
};

const VALID = new Set(TEAMS);

export function normalizeTeam(input: string): TeamAbbr {
  const trimmed = input.trim();
  if (VALID.has(trimmed)) return trimmed;
  const mapped = NAME_TO_ABBR[trimmed];
  if (mapped) return mapped;
  throw new Error(`Unknown team: "${input}"`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/teams.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/teams.ts tests/lib/teams.test.ts
git commit -m "feat: add domain types and team normalization"
```

---

## Task 3: Odds math (implied probability + de-vig)

**Files:**
- Create: `src/lib/odds.ts`, `tests/lib/odds.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/odds.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { americanToImplied, devigTwoWay } from "@/lib/odds";

describe("americanToImplied", () => {
  it("converts negative (favorite) odds", () => {
    expect(americanToImplied(-200)).toBeCloseTo(0.6667, 4);
  });
  it("converts positive (underdog) odds", () => {
    expect(americanToImplied(+150)).toBeCloseTo(0.4, 4);
  });
});

describe("devigTwoWay", () => {
  it("removes the vig so the two sides sum to 1", () => {
    const { favProb, dogProb } = devigTwoWay(-200, +170);
    expect(favProb + dogProb).toBeCloseTo(1, 6);
    expect(favProb).toBeGreaterThan(dogProb);
  });
  it("favorite prob is between raw implied and 1", () => {
    const { favProb } = devigTwoWay(-200, +170);
    expect(favProb).toBeGreaterThan(americanToImpliedTestHelper(-200) - 0.05);
  });
});

function americanToImpliedTestHelper(o: number): number {
  return o < 0 ? -o / (-o + 100) : 100 / (o + 100);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/odds.test.ts`
Expected: FAIL — cannot find module `@/lib/odds`.

- [ ] **Step 3: Write `src/lib/odds.ts`**

```ts
/** American odds → raw implied probability (includes the vig). */
export function americanToImplied(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/**
 * Remove the bookmaker overround from a two-way market by normalizing the two
 * raw implied probabilities so they sum to 1.
 * `favOdds` = one side's American odds, `dogOdds` = the other side's.
 */
export function devigTwoWay(
  favOdds: number,
  dogOdds: number,
): { favProb: number; dogProb: number } {
  const a = americanToImplied(favOdds);
  const b = americanToImplied(dogOdds);
  const total = a + b;
  return { favProb: a / total, dogProb: b / total };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/odds.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/odds.ts tests/lib/odds.test.ts
git commit -m "feat: add odds implied-probability and de-vig math"
```

---

## Task 4: FPI win-probability projection

**Files:**
- Create: `src/lib/projection.ts`, `tests/lib/projection.test.ts`

**Model:** win prob = logistic( (fpiTeam − fpiOpp + homeAdv) / SCALE ), where `homeAdv`
is added when the team is home and subtracted when away. Constants tuned so that a ~7-point
FPI edge with home field ≈ 0.75. `HOME_ADV = 2.0`, `SCALE = 7.6`.

- [ ] **Step 1: Write the failing test `tests/lib/projection.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { projectWinProb } from "@/lib/projection";

describe("projectWinProb", () => {
  it("gives 0.5 for equal teams on a neutral field", () => {
    expect(projectWinProb(0, 0, false)).toBeCloseTo(0.5, 6);
  });
  it("favors the stronger team", () => {
    expect(projectWinProb(10, 0, false)).toBeGreaterThan(0.5);
    expect(projectWinProb(0, 10, false)).toBeLessThan(0.5);
  });
  it("home field increases win prob", () => {
    const away = projectWinProb(5, 0, false);
    const home = projectWinProb(5, 0, true);
    expect(home).toBeGreaterThan(away);
  });
  it("is bounded in (0,1)", () => {
    expect(projectWinProb(100, 0, true)).toBeLessThan(1);
    expect(projectWinProb(-100, 0, false)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/projection.test.ts`
Expected: FAIL — cannot find module `@/lib/projection`.

- [ ] **Step 3: Write `src/lib/projection.ts`**

```ts
const HOME_ADV = 2.0;
const SCALE = 7.6;

/** Logistic win-probability projection from FPI ratings. */
export function projectWinProb(
  fpiTeam: number,
  fpiOpp: number,
  teamIsHome: boolean,
): number {
  const edge = fpiTeam - fpiOpp + (teamIsHome ? HOME_ADV : -HOME_ADV);
  return 1 / (1 + Math.exp(-edge / SCALE));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/projection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/projection.ts tests/lib/projection.test.ts
git commit -m "feat: add FPI logistic win-probability projection"
```

---

## Task 5: Max-weight assignment solver

**Files:**
- Create: `src/lib/matching.ts`, `tests/lib/matching.test.ts`

**Purpose:** Given a rows×cols weight matrix (rows = remaining weeks, cols = candidate teams,
weight = log win-prob, `-Infinity` = disallowed), assign each row a distinct column to
maximize total weight. Implemented as the Hungarian algorithm on a padded square cost matrix
(cost = maxWeight − weight). Returns `assignment[row] = col` (or `-1` if a row is left
unassigned, which happens only when a row has no finite option).

- [ ] **Step 1: Write the failing test `tests/lib/matching.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { maxWeightAssignment } from "@/lib/matching";

describe("maxWeightAssignment", () => {
  it("picks the single best cell for a 1x1 matrix", () => {
    expect(maxWeightAssignment([[5]])).toEqual([0]);
  });

  it("maximizes total weight over a 2x2 matrix", () => {
    // Row0 best at col1 (9), Row1 best at col1 (8) — must resolve the conflict.
    // Option A: r0->c1(9) + r1->c0(1) = 10 ; Option B: r0->c0(2)+r1->c1(8)=10 (tie)
    const m = [
      [2, 9],
      [1, 8],
    ];
    const a = maxWeightAssignment(m);
    const total = a[0] >= 0 ? m[0][a[0]] : 0 + (a[1] >= 0 ? m[1][a[1]] : 0);
    const t = m[0][a[0]] + m[1][a[1]];
    expect(t).toBe(10);
    expect(new Set(a).size).toBe(2); // distinct columns
  });

  it("classic assignment example maximizes weight", () => {
    // Known optimum for this profit matrix is 3+3+3... verify columns distinct + optimal.
    const m = [
      [7, 5, 3],
      [2, 6, 4],
      [3, 4, 5],
    ];
    const a = maxWeightAssignment(m);
    const total = m[0][a[0]] + m[1][a[1]] + m[2][a[2]];
    // brute-force optimum: r0c0(7)+r1c1(6)+r2c2(5)=18
    expect(total).toBe(18);
    expect(new Set(a).size).toBe(3);
  });

  it("never assigns a -Infinity cell", () => {
    const m = [
      [-Infinity, 4],
      [3, -Infinity],
    ];
    const a = maxWeightAssignment(m);
    expect(a[0]).toBe(1);
    expect(a[1]).toBe(0);
  });

  it("handles more cols than rows (weeks < teams)", () => {
    const m = [
      [1, 9, 2, 3],
      [4, 2, 8, 1],
    ];
    const a = maxWeightAssignment(m);
    expect(a.length).toBe(2);
    expect(new Set(a).size).toBe(2);
    expect(m[0][a[0]] + m[1][a[1]]).toBe(17); // r0c1(9)+r1c2(8)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/matching.test.ts`
Expected: FAIL — cannot find module `@/lib/matching`.

- [ ] **Step 3: Write `src/lib/matching.ts`**

```ts
/**
 * Max-weight assignment. rows = tasks that must each get a distinct column.
 * weight[-Infinity] means disallowed. Returns assignment[row] = col.
 * Implemented via the Hungarian algorithm on a square padded cost matrix.
 */
export function maxWeightAssignment(weights: number[][]): number[] {
  const nRows = weights.length;
  const nCols = weights[0]?.length ?? 0;
  const n = Math.max(nRows, nCols);

  // Convert to a cost matrix to minimize: cost = BIG - weight.
  // Disallowed (-Infinity weight) → very large cost. Padded cells → 0 weight.
  const finiteMax = Math.max(
    1,
    ...weights.flat().filter((w) => Number.isFinite(w)),
  );
  const DISALLOWED = 1e9;
  const cost: number[][] = [];
  for (let r = 0; r < n; r++) {
    cost[r] = [];
    for (let c = 0; c < n; c++) {
      if (r < nRows && c < nCols) {
        const w = weights[r][c];
        cost[r][c] = Number.isFinite(w) ? finiteMax - w : DISALLOWED;
      } else {
        cost[r][c] = finiteMax; // padded cell, neutral
      }
    }
  }

  // Hungarian algorithm (O(n^3)) via potentials.
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row assigned to col
  const way = new Array(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = -1;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  // p[col] = row → invert to assignment[row] = col, keeping only real rows/cols.
  const assignment = new Array(nRows).fill(-1);
  for (let col = 1; col <= n; col++) {
    const row = p[col] - 1;
    if (row >= 0 && row < nRows && col - 1 < nCols) {
      // Drop assignments that landed on a disallowed cell.
      if (Number.isFinite(weights[row][col - 1])) {
        assignment[row] = col - 1;
      }
    }
  }
  return assignment;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/matching.test.ts`
Expected: PASS (5 tests). If the disallowed-cell test fails, confirm `DISALLOWED` dominates.

- [ ] **Step 5: Commit**

```bash
git add src/lib/matching.ts tests/lib/matching.test.ts
git commit -m "feat: add max-weight assignment solver (Hungarian)"
```

---

## Task 6: Win-probability matrix builder

**Files:**
- Create: `src/lib/winprob-matrix.ts`, `tests/lib/winprob-matrix.test.ts`

**Purpose:** For one entry, build the per-week list of `WinProb` for every candidate team,
using de-vigged odds when a game has posted odds for that week and FPI projection otherwise.
Excludes teams already used by the entry, and excludes a team in a week where it is on a bye
(no matchup). Input: schedule (`Matchup[]`), strengths (`TeamStrength[]`), odds
(`MoneylineGame[]`), current week, and the set of used teams.

- [ ] **Step 1: Write the failing test `tests/lib/winprob-matrix.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildWinProbs } from "@/lib/winprob-matrix";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "BUF", away: "KC", kickoff: "2026-09-17T00:00:00Z" },
  // NYJ + DET on bye in week 2
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "KC", fpi: 8 },
  { team: "NYJ", fpi: -2 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [
  { week: 1, home: "BUF", away: "NYJ", homeOdds: -300, awayOdds: +250 },
];

describe("buildWinProbs", () => {
  it("uses de-vigged odds when present", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set());
    const buf1 = wps.find((w) => w.week === 1 && w.team === "BUF");
    expect(buf1?.source).toBe("odds");
    expect(buf1!.prob).toBeGreaterThan(0.7);
  });
  it("uses FPI projection when odds are absent", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set());
    const kc1 = wps.find((w) => w.week === 1 && w.team === "KC");
    expect(kc1?.source).toBe("fpi");
  });
  it("excludes used teams", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set(["BUF"]));
    expect(wps.some((w) => w.team === "BUF")).toBe(false);
  });
  it("omits past weeks and bye weeks", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 2, new Set());
    expect(wps.some((w) => w.week === 1)).toBe(false); // past
    expect(wps.some((w) => w.week === 2 && w.team === "NYJ")).toBe(false); // bye
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/winprob-matrix.test.ts`
Expected: FAIL — cannot find module `@/lib/winprob-matrix`.

- [ ] **Step 3: Write `src/lib/winprob-matrix.ts`**

```ts
import type { Matchup, TeamStrength, MoneylineGame, WinProb, TeamAbbr } from "./types";
import { devigTwoWay } from "./odds";
import { projectWinProb } from "./projection";

export function buildWinProbs(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  currentWeek: number,
  usedTeams: Set<TeamAbbr>,
): WinProb[] {
  const fpi = new Map(strengths.map((s) => [s.team, s.fpi]));
  const oddsKey = (w: number, h: TeamAbbr, a: TeamAbbr) => `${w}:${h}:${a}`;
  const oddsMap = new Map(odds.map((o) => [oddsKey(o.week, o.home, o.away), o]));
  const out: WinProb[] = [];

  for (const g of schedule) {
    if (g.week < currentWeek) continue;
    const posted = oddsMap.get(oddsKey(g.week, g.home, g.away));
    for (const teamIsHome of [true, false]) {
      const team = teamIsHome ? g.home : g.away;
      const opp = teamIsHome ? g.away : g.home;
      if (usedTeams.has(team)) continue;

      let prob: number;
      let source: WinProb["source"];
      if (posted) {
        const { favProb, dogProb } = devigTwoWay(posted.homeOdds, posted.awayOdds);
        prob = teamIsHome ? favProb : dogProb;
        source = "odds";
      } else {
        prob = projectWinProb(fpi.get(team) ?? 0, fpi.get(opp) ?? 0, teamIsHome);
        source = "fpi";
      }
      out.push({ week: g.week, team, opponent: opp, home: teamIsHome, prob, source });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/winprob-matrix.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/winprob-matrix.ts tests/lib/winprob-matrix.test.ts
git commit -m "feat: build per-entry week x team win-probability list"
```

---

## Task 7: Pick engine

**Files:**
- Create: `src/lib/pick-engine.ts`, `tests/lib/pick-engine.test.ts`

**Purpose:** For one entry, turn a `WinProb[]` into a `Recommendation`: run the season-optimal
assignment (weeks × teams on log-probs), extract the current-week pick and full projected
path, apply the safety floor (if the optimal current pick is below the floor, re-pick the
highest-prob current-week team that clears the floor — falling back to the optimal pick if
none clears it), and attach the greedy alternative + reasoning.

- [ ] **Step 1: Write the failing test `tests/lib/pick-engine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { recommend } from "@/lib/pick-engine";
import type { WinProb } from "@/lib/types";

// Juggernaut KC is 0.97 both weeks; SF is 0.85 this week, 0.55 next.
// Optimal: use SF this week (0.85), save KC for wk2 (0.97) = 0.8245
// vs KC now (0.97) + SF wk2 (0.55) = 0.5335 → engine should save KC.
const wps: WinProb[] = [
  { week: 1, team: "KC", opponent: "X", home: true, prob: 0.97, source: "odds" },
  { week: 1, team: "SF", opponent: "Y", home: true, prob: 0.85, source: "odds" },
  { week: 2, team: "KC", opponent: "Z", home: true, prob: 0.97, source: "fpi" },
  { week: 2, team: "SF", opponent: "W", home: true, prob: 0.55, source: "fpi" },
];

describe("recommend", () => {
  it("saves the juggernaut for the future week", () => {
    const rec = recommend("Jon 1", 1, wps, { safetyFloor: 0 });
    expect(rec.pick).toBe("SF");
    const kcPath = rec.projectedPath.find((p) => p.team === "KC");
    expect(kcPath?.week).toBe(2);
  });

  it("greedy alternative is the highest-prob team this week", () => {
    const rec = recommend("Jon 1", 1, wps, { safetyFloor: 0 });
    expect(rec.greedyAlt?.team).toBe("KC");
    expect(rec.greedyAlt?.prob).toBeCloseTo(0.97, 6);
  });

  it("safety floor overrides when the optimal pick is too risky", () => {
    const risky: WinProb[] = [
      { week: 1, team: "AAA", opponent: "X", home: true, prob: 0.60, source: "fpi" },
      { week: 1, team: "BBB", opponent: "Y", home: true, prob: 0.80, source: "odds" },
      { week: 2, team: "AAA", opponent: "Z", home: true, prob: 0.90, source: "fpi" },
      { week: 2, team: "BBB", opponent: "W", home: true, prob: 0.50, source: "fpi" },
    ];
    // Optimal would save BBB for... actually optimal: BBB wk1(0.8)+AAA wk2(0.9)=0.72
    // With floor 0.75, wk1 pick must be >=0.75 → BBB(0.8) already clears; unchanged.
    const rec = recommend("Jon 1", 1, risky, { safetyFloor: 0.75 });
    expect(rec.pick).toBe("BBB");
    expect(rec.prob).toBeGreaterThanOrEqual(0.75);
  });

  it("returns a null pick when no teams are available", () => {
    const rec = recommend("Jon 1", 1, [], { safetyFloor: 0 });
    expect(rec.pick).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/pick-engine.test.ts`
Expected: FAIL — cannot find module `@/lib/pick-engine`.

- [ ] **Step 3: Write `src/lib/pick-engine.ts`**

```ts
import type { WinProb, Recommendation, PathEntry, TeamAbbr } from "./types";
import { maxWeightAssignment } from "./matching";

export interface EngineOptions {
  safetyFloor: number; // 0..1 minimum acceptable prob for the current-week pick
}

export function recommend(
  entry: string,
  currentWeek: number,
  winProbs: WinProb[],
  opts: EngineOptions,
): Recommendation {
  const weeks = [...new Set(winProbs.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));

  if (weeks.length === 0 || teams.length === 0) {
    return {
      entry, week: currentWeek, pick: null, prob: 0,
      reasoning: "No available teams to pick.", greedyAlt: null, projectedPath: [],
    };
  }

  // weeks × teams matrix of log-probs; missing (bye/used) → -Infinity.
  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
      const p = probOf.get(`${wk}:${tm}`);
      return p === undefined ? -Infinity : Math.log(p);
    }),
  );
  const assignment = maxWeightAssignment(matrix);

  const projectedPath: PathEntry[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const col = assignment[i];
    if (col >= 0) {
      const team = teams[col];
      projectedPath.push({ week: weeks[i], team, prob: probOf.get(`${weeks[i]}:${team}`)! });
    }
  }

  // Current-week pieces.
  const currentWeekProbs = winProbs
    .filter((w) => w.week === currentWeek)
    .sort((a, b) => b.prob - a.prob);
  const greedy = currentWeekProbs[0]
    ? { team: currentWeekProbs[0].team, prob: currentWeekProbs[0].prob }
    : null;

  const optimalCurrent = projectedPath.find((p) => p.week === currentWeek) ?? null;

  // Safety floor: if optimal current pick is below the floor, choose the highest-prob
  // current-week team that clears the floor (falling back to the optimal pick).
  let pick: TeamAbbr | null = optimalCurrent?.team ?? null;
  let prob = optimalCurrent?.prob ?? 0;
  if (optimalCurrent && optimalCurrent.prob < opts.safetyFloor) {
    const safe = currentWeekProbs.find((w) => w.prob >= opts.safetyFloor);
    if (safe) {
      pick = safe.team;
      prob = safe.prob;
    }
  }

  const saved = optimalCurrent && greedy && optimalCurrent.team !== greedy.team
    ? projectedPath.find((p) => p.team === greedy.team)
    : null;
  const reasoning = pick
    ? saved
      ? `Pick ${pick} (${pct(prob)}); saving ${saved.team} for Week ${saved.week} (${pct(saved.prob)}).`
      : `Pick ${pick} (${pct(prob)}) — best available this week.`
    : "No available teams to pick.";

  return { entry, week: currentWeek, pick, prob, reasoning, greedyAlt: greedy, projectedPath };
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/pick-engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pick-engine.ts tests/lib/pick-engine.test.ts
git commit -m "feat: add season-optimal pick engine with safety floor"
```

---

## Task 8: Database schema + client + migrate

**Files:**
- Create: `src/lib/db/schema.sql`, `src/lib/db/client.ts`, `src/lib/db/migrate.ts`

- [ ] **Step 1: Write `src/lib/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS entries (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS picks (
  id                SERIAL PRIMARY KEY,
  entry_id          TEXT NOT NULL REFERENCES entries(id),
  week              INTEGER NOT NULL,
  team              TEXT NOT NULL,
  win_prob_at_pick  DOUBLE PRECISION,
  picked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, team),
  UNIQUE (entry_id, week)
);

CREATE TABLE IF NOT EXISTS cache (
  key        TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO entries (id, name) VALUES
  ('jon1','Jon 1'), ('jon2','Jon 2'), ('jon3','Jon 3'), ('jon4','Jon 4')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Write `src/lib/db/client.ts`**

```ts
import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const sql = neon(process.env.DATABASE_URL);
```

- [ ] **Step 3: Write `src/lib/db/migrate.ts`**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  const ddl = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  // neon() cannot run multiple statements in one call; split on ';'.
  for (const stmt of ddl.split(";").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log("Migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Apply the migration against a real Neon DB**

Create a free Neon project, copy its connection string into `.env` as `DATABASE_URL`, then:
Run: `DATABASE_URL="<neon-url>" npm run migrate`
Expected: prints "Migration complete."
Verify: `psql "<neon-url>" -c "\dt"` shows `entries`, `picks`, `cache`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.sql src/lib/db/client.ts src/lib/db/migrate.ts
git commit -m "feat: add Postgres schema, client, and migrate script"
```

---

## Task 9: Cache + picks repositories

**Files:**
- Create: `src/lib/db/cache-repo.ts`, `src/lib/db/picks-repo.ts`, `tests/lib/db/picks-repo.test.ts`

**Note:** These repos wrap SQL. The unit test below tests the *pure* `deriveUsedTeams` helper
(no DB). Full DB behavior (constraint violations) is verified manually in Step 5 against Neon,
since Vitest here does not spin up Postgres.

- [ ] **Step 1: Write `src/lib/db/cache-repo.ts`**

```ts
import { sql } from "./client";

export async function setCache(key: string, payload: unknown): Promise<void> {
  await sql`
    INSERT INTO cache (key, payload, fetched_at)
    VALUES (${key}, ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
  `;
}

export async function getCache<T>(key: string): Promise<{ payload: T; fetchedAt: string } | null> {
  const rows = (await sql`SELECT payload, fetched_at FROM cache WHERE key = ${key}`) as any[];
  if (rows.length === 0) return null;
  return { payload: rows[0].payload as T, fetchedAt: rows[0].fetched_at };
}
```

- [ ] **Step 2: Write the failing test `tests/lib/db/picks-repo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { deriveUsedTeams } from "@/lib/db/picks-repo";

describe("deriveUsedTeams", () => {
  it("collects the set of teams already picked by an entry", () => {
    const rows = [
      { week: 1, team: "BUF" },
      { week: 2, team: "KC" },
    ];
    const used = deriveUsedTeams(rows);
    expect(used.has("BUF")).toBe(true);
    expect(used.has("KC")).toBe(true);
    expect(used.has("SF")).toBe(false);
    expect(used.size).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/db/picks-repo.test.ts`
Expected: FAIL — cannot find module `@/lib/db/picks-repo`.

- [ ] **Step 4: Write `src/lib/db/picks-repo.ts`**

```ts
import { sql } from "./client";
import type { TeamAbbr } from "../types";

export interface PickRow {
  week: number;
  team: TeamAbbr;
}

export function deriveUsedTeams(rows: PickRow[]): Set<TeamAbbr> {
  return new Set(rows.map((r) => r.team));
}

export async function getPicks(entryId: string): Promise<PickRow[]> {
  return (await sql`
    SELECT week, team FROM picks WHERE entry_id = ${entryId} ORDER BY week
  `) as unknown as PickRow[];
}

export async function recordPick(
  entryId: string,
  week: number,
  team: TeamAbbr,
  winProb: number,
): Promise<void> {
  // Throws on UNIQUE violation (team reused, or week already picked).
  await sql`
    INSERT INTO picks (entry_id, week, team, win_prob_at_pick)
    VALUES (${entryId}, ${week}, ${team}, ${winProb})
  `;
}

export async function getUsedTeams(entryId: string): Promise<Set<TeamAbbr>> {
  return deriveUsedTeams(await getPicks(entryId));
}
```

- [ ] **Step 5: Run the unit test, then verify constraints manually against Neon**

Run: `npx vitest run tests/lib/db/picks-repo.test.ts`
Expected: PASS (1 test).

Manual DB check (proves the survivor rule is enforced):
```bash
psql "$DATABASE_URL" -c "INSERT INTO picks (entry_id, week, team) VALUES ('jon1', 1, 'BUF');"
psql "$DATABASE_URL" -c "INSERT INTO picks (entry_id, week, team) VALUES ('jon1', 5, 'BUF');"
# Expected: ERROR duplicate key value violates unique constraint (entry_id, team)
psql "$DATABASE_URL" -c "DELETE FROM picks WHERE entry_id='jon1';"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/cache-repo.ts src/lib/db/picks-repo.ts tests/lib/db/picks-repo.test.ts
git commit -m "feat: add cache and picks repositories"
```

---

## Task 10: ESPN schedule source

**Files:**
- Create: `src/lib/sources/espn-schedule.ts`, `tests/lib/sources/espn-schedule.test.ts`, `tests/fixtures/espn-scoreboard-week1.json`

**Endpoint:** `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=<year>&seasontype=2&week=<n>`.
The fetcher parses one week's `events[]` into `Matchup[]`. Capture a real response into the
fixture (Step 1) so the parser is tested against real shape without hitting the network.

- [ ] **Step 1: Capture a fixture**

Run:
```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=1" \
  -o tests/fixtures/espn-scoreboard-week1.json
```
Confirm the file has `events[].competitions[].competitors[]` with `homeAway` and `team.displayName`.

- [ ] **Step 2: Write the failing test `tests/lib/sources/espn-schedule.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScoreboard } from "@/lib/sources/espn-schedule";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/espn-scoreboard-week1.json"), "utf8"),
);

describe("parseScoreboard", () => {
  it("returns matchups with normalized home/away teams and week", () => {
    const games = parseScoreboard(fixture, 1);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      expect(g.week).toBe(1);
      expect(g.home).toMatch(/^[A-Z]{2,3}$/);
      expect(g.away).toMatch(/^[A-Z]{2,3}$/);
      expect(typeof g.kickoff).toBe("string");
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/espn-schedule.test.ts`
Expected: FAIL — cannot find module `@/lib/sources/espn-schedule`.

- [ ] **Step 4: Write `src/lib/sources/espn-schedule.ts`**

```ts
import type { Matchup } from "../types";
import { normalizeTeam } from "../teams";

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { displayName: string; abbreviation: string };
}
interface EspnEvent {
  date: string;
  competitions: { competitors: EspnCompetitor[] }[];
}
interface EspnScoreboard { events: EspnEvent[] }

function toAbbr(c: EspnCompetitor): string {
  try {
    return normalizeTeam(c.team.abbreviation);
  } catch {
    return normalizeTeam(c.team.displayName);
  }
}

export function parseScoreboard(data: EspnScoreboard, week: number): Matchup[] {
  const out: Matchup[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    out.push({ week, home: toAbbr(home), away: toAbbr(away), kickoff: ev.date });
  }
  return out;
}

export async function fetchWeek(week: number, season: number): Promise<Matchup[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard ${week} failed: ${res.status}`);
  return parseScoreboard(await res.json(), week);
}

export async function fetchSeasonSchedule(season: number, weeks = 18): Promise<Matchup[]> {
  const all: Matchup[] = [];
  for (let w = 1; w <= weeks; w++) all.push(...(await fetchWeek(w, season)));
  return all;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/espn-schedule.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/espn-schedule.ts tests/lib/sources/espn-schedule.test.ts tests/fixtures/espn-scoreboard-week1.json
git commit -m "feat: add ESPN schedule source"
```

---

## Task 11: ESPN FPI source (StrengthProvider)

**Files:**
- Create: `src/lib/sources/espn-fpi.ts`, `tests/lib/sources/espn-fpi.test.ts`, `tests/fixtures/espn-fpi.json`

**Endpoint (candidate):** `https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?season=<year>`.
⚠️ Unofficial — if it 404s or changes shape, the `StrengthProvider` interface lets you swap in
a fallback (season win-total odds) without touching consumers. Capture whatever the live
endpoint returns into the fixture and shape the parser to it.

- [ ] **Step 1: Capture a fixture (adjust URL if the shape differs)**

Run:
```bash
curl -s "https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?season=2026" \
  -o tests/fixtures/espn-fpi.json
head -c 400 tests/fixtures/espn-fpi.json
```
Inspect the JSON to find the array of teams and the FPI numeric field; adapt `parseFpi` in
Step 4 to the actual path (the code below assumes `teams[].team.abbreviation` and
`teams[].categories[].values[]` with a `name: "fpi"` stat — correct it to match the fixture).

- [ ] **Step 2: Write the failing test `tests/lib/sources/espn-fpi.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFpi } from "@/lib/sources/espn-fpi";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/espn-fpi.json"), "utf8"),
);

describe("parseFpi", () => {
  it("returns one strength per team with numeric fpi", () => {
    const strengths = parseFpi(fixture);
    expect(strengths.length).toBeGreaterThanOrEqual(28);
    for (const s of strengths) {
      expect(s.team).toMatch(/^[A-Z]{2,3}$/);
      expect(Number.isFinite(s.fpi)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/espn-fpi.test.ts`
Expected: FAIL — cannot find module `@/lib/sources/espn-fpi`.

- [ ] **Step 4: Write `src/lib/sources/espn-fpi.ts`**

```ts
import type { TeamStrength } from "../types";
import { normalizeTeam } from "../teams";

export interface StrengthProvider {
  fetchStrengths(season: number): Promise<TeamStrength[]>;
}

// NOTE: adapt these paths to the captured fixture shape.
export function parseFpi(data: any): TeamStrength[] {
  const teams: any[] = data.teams ?? data.items ?? [];
  const out: TeamStrength[] = [];
  for (const t of teams) {
    const abbr = t.team?.abbreviation ?? t.abbreviation;
    if (!abbr) continue;
    let fpi: number | undefined;
    for (const cat of t.categories ?? []) {
      for (const val of cat.values ?? cat.stats ?? []) {
        if ((val.name ?? "").toLowerCase() === "fpi") fpi = Number(val.value);
      }
    }
    if (fpi === undefined && typeof t.fpi === "number") fpi = t.fpi;
    if (fpi === undefined || !Number.isFinite(fpi)) continue;
    try {
      out.push({ team: normalizeTeam(abbr), fpi });
    } catch {
      /* skip non-team rows */
    }
  }
  return out;
}

export const espnFpiProvider: StrengthProvider = {
  async fetchStrengths(season: number): Promise<TeamStrength[]> {
    const url = `https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?season=${season}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN FPI failed: ${res.status}`);
    return parseFpi(await res.json());
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/espn-fpi.test.ts`
Expected: PASS. If it fails on shape, correct `parseFpi` paths to match the fixture and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/espn-fpi.ts tests/lib/sources/espn-fpi.test.ts tests/fixtures/espn-fpi.json
git commit -m "feat: add ESPN FPI strength provider"
```

---

## Task 12: The Odds API source

**Files:**
- Create: `src/lib/sources/odds-api.ts`, `tests/lib/sources/odds-api.test.ts`, `tests/fixtures/odds-api.json`

**Endpoint:** `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=<key>`.
Returns games with `home_team`, `away_team`, and `bookmakers[].markets[].outcomes[]`. The
parser averages the h2h price per team across books, then maps to `MoneylineGame`. The week
is supplied by the caller (odds have no week field) by matching against the schedule.

- [ ] **Step 1: Capture a fixture**

Run (needs a free key from the-odds-api.com):
```bash
curl -s "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=$ODDS_API_KEY" \
  -o tests/fixtures/odds-api.json
head -c 400 tests/fixtures/odds-api.json
```

- [ ] **Step 2: Write the failing test `tests/lib/sources/odds-api.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOdds } from "@/lib/sources/odds-api";
import type { Matchup } from "@/lib/types";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/odds-api.json"), "utf8"),
);

describe("parseOdds", () => {
  it("maps each game to a MoneylineGame with a week from the schedule", () => {
    // Build a schedule that assigns week 1 to every fixture matchup.
    const schedule: Matchup[] = fixture.map((g: any) => ({
      week: 1,
      home: g.home_team,
      away: g.away_team,
      kickoff: g.commence_time,
    }));
    const games = parseOdds(fixture, scheduleWeekLookup(schedule));
    for (const g of games) {
      expect(typeof g.homeOdds).toBe("number");
      expect(typeof g.awayOdds).toBe("number");
      expect(g.week).toBe(1);
    }
  });
});

function scheduleWeekLookup(schedule: Matchup[]) {
  const m = new Map<string, number>();
  for (const s of schedule) m.set(`${s.home}|${s.away}`, s.week);
  return m;
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/odds-api.test.ts`
Expected: FAIL — cannot find module `@/lib/sources/odds-api`.

- [ ] **Step 4: Write `src/lib/sources/odds-api.ts`**

```ts
import type { MoneylineGame } from "../types";
import { normalizeTeam } from "../teams";

interface OddsOutcome { name: string; price: number }
interface OddsMarket { key: string; outcomes: OddsOutcome[] }
interface OddsBook { markets: OddsMarket[] }
interface OddsGame {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBook[];
}

function avgPrice(games: OddsGame, teamName: string): number | null {
  const prices: number[] = [];
  for (const book of games.bookmakers ?? []) {
    const h2h = book.markets.find((m) => m.key === "h2h");
    const outcome = h2h?.outcomes.find((o) => o.name === teamName);
    if (outcome) prices.push(outcome.price);
  }
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

/** `weekLookup` maps `${homeAbbr}|${awayAbbr}` → week (from the schedule). */
export function parseOdds(
  data: OddsGame[],
  weekLookup: Map<string, number>,
): MoneylineGame[] {
  const out: MoneylineGame[] = [];
  for (const g of data) {
    let home: string, away: string;
    try {
      home = normalizeTeam(g.home_team);
      away = normalizeTeam(g.away_team);
    } catch {
      continue;
    }
    const homeOdds = avgPrice(g, g.home_team);
    const awayOdds = avgPrice(g, g.away_team);
    if (homeOdds === null || awayOdds === null) continue;
    const week = weekLookup.get(`${home}|${away}`);
    if (week === undefined) continue;
    out.push({ week, home, away, homeOdds: Math.round(homeOdds), awayOdds: Math.round(awayOdds) });
  }
  return out;
}

export async function fetchOdds(apiKey: string): Promise<OddsGame[]> {
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/odds-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sources/odds-api.ts tests/lib/sources/odds-api.test.ts tests/fixtures/odds-api.json
git commit -m "feat: add The Odds API source"
```

---

## Task 13: Ingestion orchestrator + current-week helper

**Files:**
- Create: `src/lib/sources/ingest.ts`, `src/lib/week.ts`, `tests/lib/week.test.ts`

**Purpose:** `currentWeek(schedule, now)` = the earliest week whose last kickoff is still in
the future (i.e. the week you still need a pick for). `ingestAll` fetches schedule + FPI +
odds, attaches weeks to odds via the schedule, and writes all three to the `cache` table.

- [ ] **Step 1: Write the failing test `tests/lib/week.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { currentWeek } from "@/lib/week";
import type { Matchup } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "KC", away: "DET", kickoff: "2026-09-17T00:00:00Z" },
];

describe("currentWeek", () => {
  it("returns the week whose games are still upcoming", () => {
    expect(currentWeek(schedule, new Date("2026-09-09T00:00:00Z"))).toBe(1);
    expect(currentWeek(schedule, new Date("2026-09-12T00:00:00Z"))).toBe(2);
  });
  it("returns the last week + 1 when the season is over", () => {
    expect(currentWeek(schedule, new Date("2027-01-01T00:00:00Z"))).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: FAIL — cannot find module `@/lib/week`.

- [ ] **Step 3: Write `src/lib/week.ts`**

```ts
import type { Matchup } from "./types";

/** The earliest week that still has a game kicking off at or after `now`. */
export function currentWeek(schedule: Matchup[], now: Date): number {
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  for (const w of weeks) {
    const lastKickoff = Math.max(
      ...schedule.filter((m) => m.week === w).map((m) => new Date(m.kickoff).getTime()),
    );
    if (lastKickoff >= now.getTime()) return w;
  }
  return (weeks[weeks.length - 1] ?? 0) + 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/week.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `src/lib/sources/ingest.ts`**

```ts
import { fetchSeasonSchedule } from "./espn-schedule";
import { espnFpiProvider } from "./espn-fpi";
import { fetchOdds, parseOdds } from "./odds-api";
import { setCache } from "../db/cache-repo";
import type { Matchup } from "../types";

export async function ingestAll(season: number, oddsApiKey: string): Promise<void> {
  const schedule = await fetchSeasonSchedule(season);
  await setCache("schedule", schedule);

  const strengths = await espnFpiProvider.fetchStrengths(season);
  await setCache("fpi", strengths);

  const rawOdds = await fetchOdds(oddsApiKey);
  const weekLookup = buildWeekLookup(schedule);
  const odds = parseOdds(rawOdds, weekLookup);
  await setCache("odds", odds);
}

function buildWeekLookup(schedule: Matchup[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of schedule) m.set(`${s.home}|${s.away}`, s.week);
  return m;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/week.ts tests/lib/week.test.ts src/lib/sources/ingest.ts
git commit -m "feat: add current-week helper and ingestion orchestrator"
```

---

## Task 14: Recommendations service (glue)

**Files:**
- Create: `src/lib/recommendations.ts`, `tests/lib/recommendations.test.ts`

**Purpose:** Pure function `buildRecommendations(schedule, strengths, odds, picksByEntry, now, floor)`
that computes the current week, builds each entry's win-prob list (excluding its used teams),
and returns a `Recommendation[]`. Keeping it pure makes it testable without DB or network; the
API route (Task 15) supplies the cached data + DB picks.

- [ ] **Step 1: Write the failing test `tests/lib/recommendations.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildRecommendations } from "@/lib/recommendations";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "NYJ", fpi: -3 },
  { team: "KC", fpi: 8 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [];

describe("buildRecommendations", () => {
  it("produces one recommendation per entry, excluding used teams", () => {
    const recs = buildRecommendations(
      schedule, strengths, odds,
      { "Jon 1": new Set(["KC"]), "Jon 2": new Set() },
      new Date("2026-09-09T00:00:00Z"),
      0.6,
    );
    expect(recs.length).toBe(2);
    const jon1 = recs.find((r) => r.entry === "Jon 1")!;
    expect(jon1.projectedPath.every((p) => p.team !== "KC")).toBe(true);
    expect(jon1.week).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/recommendations.test.ts`
Expected: FAIL — cannot find module `@/lib/recommendations`.

- [ ] **Step 3: Write `src/lib/recommendations.ts`**

```ts
import type { Matchup, TeamStrength, MoneylineGame, Recommendation, TeamAbbr } from "./types";
import { buildWinProbs } from "./winprob-matrix";
import { recommend } from "./pick-engine";
import { currentWeek } from "./week";

export function buildRecommendations(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  picksByEntry: Record<string, Set<TeamAbbr>>,
  now: Date,
  safetyFloor: number,
): Recommendation[] {
  const week = currentWeek(schedule, now);
  const recs: Recommendation[] = [];
  for (const [entry, used] of Object.entries(picksByEntry)) {
    const wps = buildWinProbs(schedule, strengths, odds, week, used);
    recs.push(recommend(entry, week, wps, { safetyFloor }));
  }
  return recs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/recommendations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recommendations.ts tests/lib/recommendations.test.ts
git commit -m "feat: add recommendations service"
```

---

## Task 15: API routes

**Files:**
- Create: `src/app/api/recommendations/route.ts`, `src/app/api/pick/route.ts`, `src/app/api/refresh/route.ts`, `src/app/api/cron/refresh/route.ts`

- [ ] **Step 1: Write `src/app/api/recommendations/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

const ENTRIES = [
  { id: "jon1", name: "Jon 1" }, { id: "jon2", name: "Jon 2" },
  { id: "jon3", name: "Jon 3" }, { id: "jon4", name: "Jon 4" },
];

export async function GET(req: Request) {
  const floor = Number(new URL(req.url).searchParams.get("floor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const picksByEntry: Record<string, Set<TeamAbbr>> = {};
  for (const e of ENTRIES) picksByEntry[e.name] = await getUsedTeams(e.id);

  const recs = buildRecommendations(schedule, strengths, odds, picksByEntry, new Date(), floor);
  return NextResponse.json({ recommendations: recs });
}
```

- [ ] **Step 2: Write `src/app/api/pick/route.ts`**

```ts
import { NextResponse } from "next/server";
import { recordPick } from "@/lib/db/picks-repo";

const NAME_TO_ID: Record<string, string> = {
  "Jon 1": "jon1", "Jon 2": "jon2", "Jon 3": "jon3", "Jon 4": "jon4",
};

export async function POST(req: Request) {
  const body = await req.json();
  const { entry, week, team, winProb } = body as {
    entry: string; week: number; team: string; winProb: number;
  };
  const entryId = NAME_TO_ID[entry];
  if (!entryId) return NextResponse.json({ error: "unknown entry" }, { status: 400 });
  try {
    await recordPick(entryId, week, team, winProb ?? 0);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // UNIQUE violation → team already used or week already picked.
    return NextResponse.json({ error: String(e.message ?? e) }, { status: 409 });
  }
}
```

- [ ] **Step 3: Write `src/app/api/refresh/route.ts` and `src/app/api/cron/refresh/route.ts`**

`src/app/api/refresh/route.ts`:
```ts
import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/sources/ingest";

export async function POST() {
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY!);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/cron/refresh/route.ts`:
```ts
import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/sources/ingest";

export async function GET(req: Request) {
  // Vercel Cron sends this header; reject anything else.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY!);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify routes compile**

Run: `npm run build`
Expected: build succeeds with the four routes listed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "feat: add recommendations, pick, and refresh API routes"
```

---

## Task 16: Password gate middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write `src/middleware.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = "sp_auth";

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Cron route authenticates via its own bearer header; skip the cookie gate.
  if (pathname.startsWith("/api/cron")) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next(); // no gate configured

  if (req.cookies.get(COOKIE)?.value === password) return NextResponse.next();

  // Allow login via ?pw=... then set the cookie and redirect to clean URL.
  if (searchParams.get("pw") === password) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("pw");
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE, password, { httpOnly: true, sameSite: "lax", path: "/" });
    return res;
  }

  return new NextResponse("Unauthorized. Append ?pw=YOUR_PASSWORD to the URL.", { status: 401 });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds; middleware compiles.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add single-password gate middleware"
```

---

## Task 17: Dashboard UI

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/dashboard-client.tsx`

- [ ] **Step 1: Write `src/app/dashboard-client.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";

export default function DashboardClient() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [floor, setFloor] = useState(0.6);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/recommendations?floor=${floor}`);
    const data = await res.json();
    setRecs(data.recommendations);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [floor]);

  async function confirm(r: Recommendation) {
    if (!r.pick) return;
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entry: r.entry, week: r.week, team: r.pick, winProb: r.prob }),
    });
    if (!res.ok) alert((await res.json()).error);
    else load();
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Survivor Pool — Week {recs[0]?.week ?? "?"}</h1>
      <label>Safety floor: {Math.round(floor * 100)}%{" "}
        <input type="range" min={0} max={0.95} step={0.05}
          value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
      </label>
      {loading && <p>Loading…</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {recs.map((r) => (
          <div key={r.entry} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
            <h2 style={{ margin: 0 }}>{r.entry}</h2>
            <p style={{ fontSize: 24, fontWeight: 700 }}>
              {r.pick ?? "—"} {r.pick && <span>({Math.round(r.prob * 100)}%)</span>}
            </p>
            <p style={{ color: "#555" }}>{r.reasoning}</p>
            {r.greedyAlt && r.greedyAlt.team !== r.pick && (
              <p style={{ fontSize: 12, color: "#888" }}>
                Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
              </p>
            )}
            <button onClick={() => confirm(r)} disabled={!r.pick}>Confirm pick</button>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>
        <a href="/grid">Grid view</a> · <a href="/log">Pick log</a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import DashboardClient from "./dashboard-client";
export default function Home() {
  return <DashboardClient />;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/dashboard-client.tsx
git commit -m "feat: add dashboard UI with per-entry recommendations"
```

---

## Task 18: Grid view UI

**Files:**
- Create: `src/app/grid/page.tsx`, `src/app/api/grid/route.ts`

**Purpose:** Show teams × upcoming weeks colored by win prob for a chosen entry (used teams
omitted). Reuses `buildWinProbs` server-side.

- [ ] **Step 1: Write `src/app/api/grid/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const NAME_TO_ID: Record<string, string> = {
  "Jon 1": "jon1", "Jon 2": "jon2", "Jon 3": "jon3", "Jon 4": "jon4",
};

export async function GET(req: Request) {
  const entry = new URL(req.url).searchParams.get("entry") ?? "Jon 1";
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(NAME_TO_ID[entry] ?? "jon1");
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  return NextResponse.json({ week, winProbs: wps });
}
```

- [ ] **Step 2: Write `src/app/grid/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { WinProb } from "@/lib/types";

const ENTRIES = ["Jon 1", "Jon 2", "Jon 3", "Jon 4"];

function color(p: number): string {
  // red (low) → green (high)
  const hue = Math.round(p * 120); // 0=red, 120=green
  return `hsl(${hue}, 70%, 85%)`;
}

export default function GridPage() {
  const [entry, setEntry] = useState("Jon 1");
  const [wps, setWps] = useState<WinProb[]>([]);

  useEffect(() => {
    fetch(`/api/grid?entry=${encodeURIComponent(entry)}`)
      .then((r) => r.json())
      .then((d) => setWps(d.winProbs));
  }, [entry]);

  const weeks = [...new Set(wps.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(wps.map((w) => w.team))].sort();
  const cell = new Map(wps.map((w) => [`${w.week}:${w.team}`, w]));

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Grid — {entry}</h1>
      <select value={entry} onChange={(e) => setEntry(e.target.value)}>
        {ENTRIES.map((n) => <option key={n}>{n}</option>)}
      </select>
      <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr><th>Team</th>{weeks.map((w) => <th key={w} style={{ padding: 4 }}>W{w}</th>)}</tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t}>
              <td style={{ fontWeight: 700, padding: 4 }}>{t}</td>
              {weeks.map((w) => {
                const c = cell.get(`${w}:${t}`);
                return (
                  <td key={w} style={{
                    padding: 4, textAlign: "center",
                    background: c ? color(c.prob) : "#f3f3f3",
                  }}>
                    {c ? `${Math.round(c.prob * 100)}%` : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24 }}><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/grid/page.tsx src/app/api/grid/route.ts
git commit -m "feat: add heat-colored grid view"
```

---

## Task 19: Pick log UI

**Files:**
- Create: `src/app/log/page.tsx`, `src/app/api/log/route.ts`

- [ ] **Step 1: Write `src/app/api/log/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getPicks } from "@/lib/db/picks-repo";

const ENTRIES = [
  { id: "jon1", name: "Jon 1" }, { id: "jon2", name: "Jon 2" },
  { id: "jon3", name: "Jon 3" }, { id: "jon4", name: "Jon 4" },
];

export async function GET() {
  const log: Record<string, { week: number; team: string }[]> = {};
  for (const e of ENTRIES) log[e.name] = await getPicks(e.id);
  return NextResponse.json({ log });
}
```

- [ ] **Step 2: Write `src/app/log/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

type Log = Record<string, { week: number; team: string }[]>;

export default function LogPage() {
  const [log, setLog] = useState<Log>({});
  useEffect(() => {
    fetch("/api/log").then((r) => r.json()).then((d) => setLog(d.log));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Pick Log</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {Object.entries(log).map(([entry, picks]) => (
          <div key={entry}>
            <h3>{entry}</h3>
            <ol>
              {picks.map((p) => <li key={p.week}>W{p.week}: {p.team}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}><a href="/">← Dashboard</a></p>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/log/page.tsx src/app/api/log/route.ts
git commit -m "feat: add pick log view"
```

---

## Task 20: Vercel cron + deploy config

**Files:**
- Create: `vercel.json`, `README.md`

- [ ] **Step 1: Write `vercel.json`**

Cron runs Tue/Thu/Sat at 12:00 UTC to refresh odds/FPI/schedule.
```json
{
  "crons": [
    { "path": "/api/cron/refresh", "schedule": "0 12 * * 2,4,6" }
  ]
}
```

- [ ] **Step 2: Write `README.md`**

```markdown
# Survivor Pool

Next.js/Vercel app that recommends weekly NFL survivor picks for four entries using
de-vigged moneyline odds (The Odds API) and FPI projections (ESPN), with a season-optimal
assignment engine. State in Postgres (Neon).

## Setup
1. `npm install`
2. Create a Neon Postgres DB; set `DATABASE_URL`.
3. Get a free key at the-odds-api.com; set `ODDS_API_KEY`.
4. Set `APP_PASSWORD` (site gate), `CRON_SECRET` (cron auth), `NFL_SEASON`.
5. `npm run migrate` to create tables + seed the four entries.
6. `npm run dev`, then open `/?pw=YOUR_PASSWORD`.
7. Click nothing loads data until you refresh: `curl -XPOST localhost:3000/api/refresh`
   (or wait for the deployed cron).

## Deploy
- Push to GitHub, import into Vercel, set the env vars above (add `CRON_SECRET`).
- Vercel Cron (see `vercel.json`) refreshes data Tue/Thu/Sat.

## How picks work
Record the pick you actually made each week via the dashboard "Confirm pick" button. The
DB enforces one-team-per-entry and one-pick-per-week, so an illegal pick is rejected.
```

- [ ] **Step 3: Full local smoke test**

Run:
```bash
npm run migrate
npm run dev &
sleep 5
curl -s -XPOST localhost:3000/api/refresh
curl -s "localhost:3000/api/recommendations?floor=0.6" | head -c 400
```
Expected: refresh returns `{"ok":true}`; recommendations returns four entries with picks.

- [ ] **Step 4: Commit**

```bash
git add vercel.json README.md
git commit -m "chore: add Vercel cron config and README"
```

---

## Task 21: Full test-suite gate + final commit

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests across `tests/lib/**` pass.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; production build succeeds.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: green full suite and production build" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** ESPN schedule+FPI (Tasks 10–11), The Odds API (Task 12), de-vig +
  FPI projection win-prob model (Tasks 3–4, 6), season-optimal assignment + safety floor +
  greedy alt + reasoning (Tasks 5, 7), Postgres with UNIQUE survivor constraints (Tasks 8–9),
  dashboard/grid/log UI (Tasks 17–19), cron + manual refresh + password gate (Tasks 15, 16, 20),
  Splash Sports manual pick entry (Task 17 confirm button). All spec sections covered.
- **Known risk carried from spec:** ESPN FPI endpoint is unofficial — Task 11 captures a live
  fixture and isolates parsing behind `StrengthProvider` so a fallback can be swapped in.
- **Type consistency:** `Recommendation`, `WinProb`, `Matchup`, `TeamStrength`, `MoneylineGame`
  defined once in Task 2 and used unchanged throughout; `recommend()`, `buildWinProbs()`,
  `maxWeightAssignment()`, `buildRecommendations()`, `ingestAll()` signatures are stable across
  their consumers.
