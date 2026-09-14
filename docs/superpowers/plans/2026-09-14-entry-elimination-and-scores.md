# Entry Elimination & Pick Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-detect (with manual per-week override) when a survivor-pool entry is eliminated, and show each pick's score/result — including live games — on the dashboard.

**Architecture:** Elimination is *derived* on every request from three persisted inputs — the entry's picks, cached game `results`, and manual per-week `pick_overrides` plus a per-entry `settings.ties_survive` flag. Nothing about elimination is stored, so it can never drift from the scores shown beside it. Game results reuse the ESPN scoreboard endpoint the app already fetches, cached separately with a 60s live window.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Postgres (Neon serverless), vitest, Tailwind. Tests follow the existing convention: pure lib functions are unit-tested; routes/UI glue is verified manually against the dev server (the repo has no route/integration tests).

**Reference spec:** `docs/superpowers/specs/2026-09-14-entry-elimination-and-scores-design.md`

---

## Phase 1 — Results ingestion + score display

Ships on its own: after Phase 1 the dashboard shows each pick's score and live status. No elimination yet.

### Task 1: `GameResult` type + `parseResults` scoreboard parser

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/sources/espn-schedule.ts`
- Test: `tests/lib/sources/espn-schedule.test.ts` (create)

- [ ] **Step 1: Add the new types**

In `src/lib/types.ts`, add after the `Matchup` interface (around line 8):

```ts
export interface GameResult {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string; // ISO
  homeScore: number | null; // null until the game has started
  awayScore: number | null;
  winner: TeamAbbr | null; // null = tie (if completed) or not yet decided
  completed: boolean; // status.type.completed
  inProgress: boolean; // status.type.state === "in"
  statusDetail: string; // e.g. "Final", "Q3 5:22", "Sun 1:00 PM"
}

export type PickOutcome = "won" | "lost" | "tie" | "pending" | "live";
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/sources/espn-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseResults } from "@/lib/sources/espn-schedule";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/espn-scoreboard-week1.json"), "utf8"),
);

describe("parseResults", () => {
  it("extracts scores, winner, and completion from a final game", () => {
    const results = parseResults(fixture, 1);
    expect(results.length).toBeGreaterThan(0);
    const g = results[0];
    expect(g.week).toBe(1);
    expect(g.completed).toBe(true);
    expect(g.inProgress).toBe(false);
    expect(typeof g.homeScore).toBe("number");
    expect(typeof g.awayScore).toBe("number");
    // The winner is whichever team ESPN flagged winner:true.
    expect([g.home, g.away]).toContain(g.winner);
    expect(g.statusDetail).toBe("Final");
  });

  it("treats an unstarted game as pending (null scores, null winner)", () => {
    const data = {
      events: [{
        date: "2026-09-13T17:00:00Z",
        competitions: [{
          status: { type: { state: "pre", completed: false, shortDetail: "Sun 1:00 PM" } },
          competitors: [
            { homeAway: "home", team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
            { homeAway: "away", team: { abbreviation: "NYJ", displayName: "New York Jets" } },
          ],
        }],
      }],
    };
    const [g] = parseResults(data, 1);
    expect(g.completed).toBe(false);
    expect(g.inProgress).toBe(false);
    expect(g.homeScore).toBeNull();
    expect(g.awayScore).toBeNull();
    expect(g.winner).toBeNull();
  });

  it("marks an in-progress game and keeps live scores", () => {
    const data = {
      events: [{
        date: "2026-09-13T17:00:00Z",
        competitions: [{
          status: { type: { state: "in", completed: false, shortDetail: "Q3 5:22" } },
          competitors: [
            { homeAway: "home", winner: false, score: 14, team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
            { homeAway: "away", winner: false, score: 10, team: { abbreviation: "NYJ", displayName: "New York Jets" } },
          ],
        }],
      }],
    };
    const [g] = parseResults(data, 1);
    expect(g.inProgress).toBe(true);
    expect(g.completed).toBe(false);
    expect(g.homeScore).toBe(14);
    expect(g.awayScore).toBe(10);
    expect(g.winner).toBeNull();
    expect(g.statusDetail).toBe("Q3 5:22");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/espn-schedule.test.ts`
Expected: FAIL — `parseResults` is not exported.

- [ ] **Step 4: Implement `parseResults`**

In `src/lib/sources/espn-schedule.ts`, update the type import and the ESPN interfaces, then add the parser. Replace the top of the file (lines 1–12) with:

```ts
import type { Matchup, GameResult, TeamAbbr } from "../types";
import { normalizeTeam } from "../teams";

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { displayName: string; abbreviation: string };
  score?: number | string;
  winner?: boolean;
}
interface EspnStatusType { state?: string; completed?: boolean; shortDetail?: string }
interface EspnCompetition {
  competitors: EspnCompetitor[];
  status?: { type?: EspnStatusType };
}
interface EspnEvent { date: string; competitions: EspnCompetition[] }
interface EspnScoreboard { events: EspnEvent[] }
```

Then add, after the existing `parseScoreboard` function (after line 33):

```ts
export function parseResults(data: EspnScoreboard, week: number): GameResult[] {
  const out: GameResult[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const type = comp.status?.type ?? {};
    const completed = type.completed === true;
    const inProgress = type.state === "in";
    const homeScore = home.score != null ? Number(home.score) : null;
    const awayScore = away.score != null ? Number(away.score) : null;
    let winner: TeamAbbr | null = null;
    if (home.winner) winner = toAbbr(home);
    else if (away.winner) winner = toAbbr(away);
    out.push({
      week,
      home: toAbbr(home),
      away: toAbbr(away),
      kickoff: ev.date,
      homeScore,
      awayScore,
      winner,
      completed,
      inProgress,
      statusDetail: type.shortDetail ?? "",
    });
  }
  return out;
}

export async function fetchWeekResults(week: number, season: number): Promise<GameResult[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN results ${week} failed: ${res.status}`);
  return parseResults(await res.json(), week);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/espn-schedule.test.ts`
Expected: PASS (3 tests). Also run `npx tsc --noEmit` — expect no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/sources/espn-schedule.ts tests/lib/sources/espn-schedule.test.ts
git commit -m "feat: parse ESPN scoreboard results (scores, winner, live status)"
```

---

### Task 2: Results cache with a 60s live window

**Files:**
- Create: `src/lib/sources/results.ts`
- Test: `tests/lib/sources/results.test.ts` (create)

- [ ] **Step 1: Write the failing test** (pure merge + staleness logic)

Create `tests/lib/sources/results.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mergeResults, shouldRefetch } from "@/lib/sources/results";
import type { GameResult } from "@/lib/types";

function g(over: Partial<GameResult>): GameResult {
  return {
    week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-13T17:00:00Z",
    homeScore: null, awayScore: null, winner: null, completed: false,
    inProgress: false, statusDetail: "", ...over,
  };
}

describe("mergeResults", () => {
  it("replaces prior games by (week, home, away) and keeps others", () => {
    const prior = [g({ week: 1, statusDetail: "old" }), g({ week: 2, home: "KC", away: "DET" })];
    const fresh = [g({ week: 1, statusDetail: "new", completed: true })];
    const merged = mergeResults(prior, fresh);
    expect(merged).toHaveLength(2);
    const wk1 = merged.find((r) => r.week === 1)!;
    expect(wk1.statusDetail).toBe("new");
    expect(wk1.completed).toBe(true);
    expect(merged.some((r) => r.week === 2)).toBe(true);
  });
});

describe("shouldRefetch", () => {
  const now = new Date("2026-09-13T18:00:00Z");
  it("refetches when the week is missing", () => {
    expect(shouldRefetch([], 1, "2026-09-13T17:59:50Z", now)).toBe(true);
  });
  it("never refetches when every game that week is final", () => {
    const wk = [g({ week: 1, completed: true })];
    expect(shouldRefetch(wk, 1, "2026-09-13T17:00:00Z", now)).toBe(false);
  });
  it("refetches a non-final week older than 60s", () => {
    const wk = [g({ week: 1, inProgress: true })];
    expect(shouldRefetch(wk, 1, "2026-09-13T17:58:00Z", now)).toBe(true);
  });
  it("does not refetch a non-final week fetched within 60s", () => {
    const wk = [g({ week: 1, inProgress: true })];
    expect(shouldRefetch(wk, 1, "2026-09-13T17:59:30Z", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sources/results.test.ts`
Expected: FAIL — module `@/lib/sources/results` not found.

- [ ] **Step 3: Implement the results source**

Create `src/lib/sources/results.ts`:

```ts
import { getCache, setCache } from "../db/cache-repo";
import { fetchWeekResults } from "./espn-schedule";
import type { GameResult } from "../types";

const KEY = "results";
const LIVE_TTL_MS = 60 * 1000;

function keyOf(r: GameResult): string {
  return `${r.week}|${r.home}|${r.away}`;
}

/** Merge fresh results over prior, replacing games with the same (week, home, away). */
export function mergeResults(prior: GameResult[], fresh: GameResult[]): GameResult[] {
  const map = new Map<string, GameResult>();
  for (const r of prior) map.set(keyOf(r), r);
  for (const r of fresh) map.set(keyOf(r), r);
  return [...map.values()];
}

/** True when the given week's cached results are missing, or non-final and older than the live TTL. */
export function shouldRefetch(
  results: GameResult[],
  week: number,
  fetchedAt: string | null,
  now: Date,
): boolean {
  const wk = results.filter((r) => r.week === week);
  if (wk.length === 0) return true;
  if (wk.every((r) => r.completed)) return false;
  if (!fetchedAt) return true;
  return now.getTime() - new Date(fetchedAt).getTime() > LIVE_TTL_MS;
}

/**
 * Season results, refreshing only the current week when its live window has lapsed.
 * On an empty cache, seeds every week up to `week` so past picks resolve.
 */
export async function getResultsFresh(
  week: number,
  season: number,
  now: Date = new Date(),
): Promise<GameResult[]> {
  const cached = await getCache<GameResult[]>(KEY);
  const prior = cached?.payload ?? [];

  if (prior.length === 0) {
    const all: GameResult[] = [];
    for (let w = 1; w <= week; w++) all.push(...(await fetchWeekResults(w, season)));
    await setCache(KEY, all);
    return all;
  }

  if (!shouldRefetch(prior, week, cached?.fetchedAt ?? null, now)) return prior;

  const fresh = await fetchWeekResults(week, season);
  const merged = mergeResults(prior, fresh);
  await setCache(KEY, merged);
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/sources/results.test.ts`
Expected: PASS (5 tests). Run `npx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sources/results.ts tests/lib/sources/results.test.ts
git commit -m "feat: results cache with 60s live-refresh window"
```

---

### Task 3: `pickResultViews` helper (per-pick score view)

**Files:**
- Create: `src/lib/elimination.ts`
- Test: `tests/lib/elimination.test.ts` (create)

This task adds only the display helper; the elimination logic lands in Task 6 in the same file.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/elimination.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickResultViews } from "@/lib/elimination";
import type { GameResult } from "@/lib/types";

const results: GameResult[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "", homeScore: 24, awayScore: 17,
    winner: "BUF", completed: true, inProgress: false, statusDetail: "Final" },
];

describe("pickResultViews", () => {
  it("builds a per-week view with the picked team's score first", () => {
    const views = pickResultViews({ 1: "BUF" }, results, { 1: "won" });
    expect(views[1]).toEqual({
      week: 1, team: "BUF", outcome: "won", teamScore: 24, oppScore: 17,
      opponent: "NYJ", statusDetail: "Final",
    });
  });
  it("orients scores from the away team's perspective when they were picked", () => {
    const views = pickResultViews({ 1: "NYJ" }, results, { 1: "lost" });
    expect(views[1].teamScore).toBe(17);
    expect(views[1].oppScore).toBe(24);
    expect(views[1].opponent).toBe("BUF");
  });
  it("returns a pending view when no result exists yet", () => {
    const views = pickResultViews({ 2: "KC" }, results, {});
    expect(views[2]).toEqual({
      week: 2, team: "KC", outcome: "pending", teamScore: null, oppScore: null,
      opponent: null, statusDetail: "",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/elimination.test.ts`
Expected: FAIL — module `@/lib/elimination` not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/elimination.ts`:

```ts
import type { GameResult, PickOutcome, TeamAbbr } from "./types";

export interface PickResultView {
  week: number;
  team: TeamAbbr;
  outcome: PickOutcome;
  teamScore: number | null;
  oppScore: number | null;
  opponent: TeamAbbr | null;
  statusDetail: string;
}

/** Per-week view of each pick's score, oriented from the picked team's side. */
export function pickResultViews(
  picksByWeek: Record<number, TeamAbbr>,
  results: GameResult[],
  byWeek: Record<number, PickOutcome>,
): Record<number, PickResultView> {
  const out: Record<number, PickResultView> = {};
  for (const [wStr, team] of Object.entries(picksByWeek)) {
    const week = Number(wStr);
    const r = results.find((g) => g.week === week && (g.home === team || g.away === team));
    let teamScore: number | null = null;
    let oppScore: number | null = null;
    let opponent: TeamAbbr | null = null;
    if (r) {
      const isHome = r.home === team;
      teamScore = isHome ? r.homeScore : r.awayScore;
      oppScore = isHome ? r.awayScore : r.homeScore;
      opponent = isHome ? r.away : r.home;
    }
    out[week] = {
      week,
      team,
      outcome: byWeek[week] ?? "pending",
      teamScore,
      oppScore,
      opponent,
      statusDetail: r?.statusDetail ?? "",
    };
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/elimination.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elimination.ts tests/lib/elimination.test.ts
git commit -m "feat: per-pick score view helper"
```

---

### Task 4: Surface scores in the recommendations API + dashboard timeline

**Files:**
- Modify: `src/app/api/recommendations/route.ts`
- Modify: `src/app/dashboard-client.tsx`

No new unit tests (route/UI glue — verified manually, matching repo convention).

- [ ] **Step 1: Add results + `resultsByWeek` to the recommendations route**

In `src/app/api/recommendations/route.ts`, add imports at the top:

```ts
import { getResultsFresh } from "@/lib/sources/results";
import { pickResultViews } from "@/lib/elimination";
import { currentWeek } from "@/lib/week";
```

After `const odds = ...` (the three cache reads), add:

```ts
  const cur = currentWeek(schedule, new Date());
  const results = await getResultsFresh(cur, Number(process.env.NFL_SEASON ?? "2026"));
```

Then in the `data = recs.map(...)` block, add a `resultsByWeek` attribute. Replace the mapped object's attributes with:

```ts
    resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      currentPick: week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null,
      picksByWeek: picksByWeekByEntry[r.entry] ?? {},
      // Per-week score/status for every pick this entry has made.
      resultsByWeek: pickResultViews(
        Object.fromEntries(
          Object.entries(picksByWeekByEntry[r.entry] ?? {}).map(([w, t]) => [Number(w), t]),
        ),
        results,
        {}, // outcomes filled in Phase 2; scores/status are available now
      ),
    }),
```

- [ ] **Step 2: Verify the API returns scores**

Run the dev server if not running: `npm run dev`. Then:

Run: `curl -s 'http://localhost:3000/api/recommendations?safetyFloor=0.6' | python3 -m json.tool | head -60`
Expected: each recommendation's `attributes.resultsByWeek` is present; for any past/live pick it shows `teamScore`, `oppScore`, `opponent`, `statusDetail` (numbers/strings), and `outcome: "pending"` for now.

- [ ] **Step 3: Render score chips in the dashboard timeline**

In `src/app/dashboard-client.tsx`, extend the `Rec` type (around line 9) to include:

```ts
type Rec = Recommendation & {
  currentPick?: string | null;
  entryId?: string;
  picksByWeek?: Record<number, string>;
  resultsByWeek?: Record<number, {
    week: number; team: string; outcome: "won" | "lost" | "tie" | "pending" | "live";
    teamScore: number | null; oppScore: number | null; opponent: string | null; statusDetail: string;
  }>;
};
```

Add this pure helper above the component (after `timeAgo`, ~line 23):

```ts
function cellClasses(outcome: string | undefined, isCurrent: boolean): string {
  if (outcome === "won" || outcome === "tie") return "border-emerald-400 bg-emerald-50";
  if (outcome === "lost") return "border-red-400 bg-red-50";
  if (outcome === "live") return "border-amber-400 bg-amber-50";
  return isCurrent ? "border-emerald-400 bg-emerald-50" : "border-slate-100";
}
```

Then, in the season-timeline `weeks.map((w) => { ... })` block (around lines 262–284), replace the button's `className` computed from `isCurrent` and add a score line. Replace the whole returned `<button>...</button>` with:

```tsx
                    const rv = r.resultsByWeek?.[w];
                    return (
                      <button
                        key={w}
                        onClick={() => openPickModal(r, w)}
                        title={rv?.statusDetail || `Pick ${r.entry}'s Week ${w} team`}
                        className={`flex min-w-[44px] flex-col items-center rounded-lg border px-1 py-1 transition-colors hover:border-slate-400 hover:bg-slate-50 ${cellClasses(rv?.outcome, isCurrent)}`}
                      >
                        <span className="text-[10px] text-slate-400">W{w}</span>
                        {team ? (
                          <>
                            <TeamLogo abbr={team} size={20} />
                            <span className="text-[10px] font-semibold">{team}</span>
                            {rv && rv.teamScore != null && rv.oppScore != null && (
                              <span className="text-[9px] tabular-nums text-slate-500">
                                {rv.teamScore}–{rv.oppScore}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="py-1 text-slate-300">+</span>
                        )}
                      </button>
                    );
```

(Delete the old `const isCurrent = w === r.week;` line only if you inline it; keep it — it is still referenced.)

- [ ] **Step 4: Manually verify in the browser**

Open `http://localhost:3000`. Confirm: past/current picks in each entry's timeline show a score (e.g. `24–17`); winning weeks shade green, losing weeks red, in-progress amber; future/unplayed weeks stay neutral.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/recommendations/route.ts src/app/dashboard-client.tsx
git commit -m "feat: show per-pick scores and W/L shading in dashboard timeline"
```

---

## Phase 2 — Elimination (auto-detect + per-week override)

### Task 5: Schema — `settings` column + `pick_overrides` table

**Files:**
- Modify: `src/lib/db/schema.sql`

- [ ] **Step 1: Add the DDL**

Append to `src/lib/db/schema.sql` (after the `cache` table, before the seed `INSERT`):

```sql
ALTER TABLE entries ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS pick_overrides (
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  week     INTEGER NOT NULL,
  outcome  TEXT NOT NULL CHECK (outcome IN ('survived', 'out')),
  PRIMARY KEY (entry_id, week)
);
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate`
Expected: `Migration complete.` with no errors. (The migrate script splits on `;` and runs each statement; `ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` are idempotent.)

- [ ] **Step 3: Verify the schema**

Run: `npm run migrate` again.
Expected: `Migration complete.` again (idempotent, no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.sql
git commit -m "feat: entries.settings column and pick_overrides table"
```

---

### Task 6: Elimination logic — `outcomeForWeek` + `deriveEntryStatus`

**Files:**
- Modify: `src/lib/elimination.ts`
- Modify: `tests/lib/elimination.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/elimination.test.ts`:

```ts
import { outcomeForWeek, deriveEntryStatus } from "@/lib/elimination";

function res(over: Partial<GameResult>): GameResult {
  return {
    week: 1, home: "BUF", away: "NYJ", kickoff: "", homeScore: null, awayScore: null,
    winner: null, completed: false, inProgress: false, statusDetail: "", ...over,
  };
}

describe("outcomeForWeek", () => {
  it("won when the picked team is the winner", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: "BUF" }), true)).toBe("won");
  });
  it("lost when the other team won", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: "NYJ" }), true)).toBe("lost");
  });
  it("tie survives when ties_survive is true", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: null }), true)).toBe("tie");
  });
  it("tie counts as a loss when ties_survive is false", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: null }), false)).toBe("lost");
  });
  it("live for an in-progress game", () => {
    expect(outcomeForWeek("BUF", res({ inProgress: true }), true)).toBe("live");
  });
  it("pending when there is no result", () => {
    expect(outcomeForWeek("BUF", undefined, true)).toBe("pending");
  });
});

describe("deriveEntryStatus", () => {
  const results: GameResult[] = [
    res({ week: 1, home: "BUF", away: "NYJ", winner: "BUF", completed: true }),
    res({ week: 2, home: "KC", away: "DET", winner: "DET", completed: true }),
    res({ week: 3, home: "SF", away: "LAR", winner: "LAR", completed: true }),
  ];

  it("survives when every pick won", () => {
    const s = deriveEntryStatus({ 1: "BUF" }, results, {}, true);
    expect(s.eliminated).toBe(false);
    expect(s.eliminatedWeek).toBeNull();
    expect(s.byWeek[1]).toBe("won");
  });

  it("eliminates at the first losing week", () => {
    const s = deriveEntryStatus({ 1: "BUF", 2: "KC" }, results, {}, true);
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(2);
  });

  it("a 'survived' override forgives that week but a later loss re-eliminates", () => {
    const s = deriveEntryStatus({ 2: "KC", 3: "SF" }, results, { 2: "survived" }, true);
    expect(s.byWeek[2]).toBe("won");
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(3); // the W3 loss still eliminates
  });

  it("an 'out' override eliminates even without a detected loss", () => {
    const s = deriveEntryStatus({ 1: "BUF" }, results, { 1: "out" }, true);
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(1);
  });

  it("respects ties_survive=false", () => {
    const tie = [res({ week: 1, home: "BUF", away: "NYJ", winner: null, completed: true })];
    expect(deriveEntryStatus({ 1: "BUF" }, tie, {}, false).eliminated).toBe(true);
    expect(deriveEntryStatus({ 1: "BUF" }, tie, {}, true).eliminated).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/elimination.test.ts`
Expected: FAIL — `outcomeForWeek` / `deriveEntryStatus` not exported.

- [ ] **Step 3: Implement the logic**

Append to `src/lib/elimination.ts`:

```ts
export function outcomeForWeek(
  pick: TeamAbbr,
  result: GameResult | undefined,
  tiesSurvive: boolean,
): PickOutcome {
  if (!result) return "pending";
  if (result.inProgress && !result.completed) return "live";
  if (!result.completed) return "pending";
  if (result.winner === pick) return "won";
  if (result.winner === null) return tiesSurvive ? "tie" : "lost"; // completed tie
  return "lost";
}

export interface EntryStatus {
  eliminated: boolean;
  eliminatedWeek: number | null;
  byWeek: Record<number, PickOutcome>;
}

/**
 * Derive elimination by walking picks in week order. Each week resolves to an
 * override outcome when present, otherwise the auto outcome. The entry is
 * eliminated at the first week that resolves to a loss.
 */
export function deriveEntryStatus(
  picksByWeek: Record<number, TeamAbbr>,
  results: GameResult[],
  overrides: Record<number, "survived" | "out">,
  tiesSurvive: boolean,
): EntryStatus {
  const byWeek: Record<number, PickOutcome> = {};
  let eliminated = false;
  let eliminatedWeek: number | null = null;

  const weeks = Object.keys(picksByWeek).map(Number).sort((a, b) => a - b);
  for (const w of weeks) {
    const pick = picksByWeek[w];
    const result = results.find((r) => r.week === w && (r.home === pick || r.away === pick));
    const ov = overrides[w];
    let outcome: PickOutcome;
    if (ov === "out") outcome = "lost";
    else if (ov === "survived") outcome = "won";
    else outcome = outcomeForWeek(pick, result, tiesSurvive);

    byWeek[w] = outcome;
    if (!eliminated && outcome === "lost") {
      eliminated = true;
      eliminatedWeek = w;
    }
  }
  return { eliminated, eliminatedWeek, byWeek };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/elimination.test.ts`
Expected: PASS (all `outcomeForWeek` + `deriveEntryStatus` cases, plus the Task 3 view tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/elimination.ts tests/lib/elimination.test.ts
git commit -m "feat: derive entry elimination from results, overrides, and tie rule"
```

---

### Task 7: `Entry.settings` + entries-repo support

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db/entries-repo.ts`

- [ ] **Step 1: Add `EntrySettings` and extend `Entry`**

In `src/lib/types.ts`, replace the `Entry` interface (lines 62–65) with:

```ts
export interface EntrySettings {
  ties_survive?: boolean; // absent → treated as true
}

export interface Entry {
  id: string;
  name: string;
  settings: EntrySettings;
}
```

- [ ] **Step 2: Update the repo to read/write settings**

In `src/lib/db/entries-repo.ts`:

Update the import line to include `EntrySettings`:

```ts
import type { Entry, EntrySettings } from "../types";
```

Replace `fetchEntries` (lines 8–10) with:

```ts
async function fetchEntries(): Promise<Entry[]> {
  return (await sql`SELECT id, name, settings FROM entries ORDER BY name`) as unknown as Entry[];
}
```

In `createEntry`, change the return (line 22) to:

```ts
  return { id, name: clean, settings: {} };
```

Add a new exported function at the end of the file:

```ts
export async function updateSettings(id: string, settings: EntrySettings): Promise<void> {
  await sql`UPDATE entries SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${id}`;
  revalidateTag(TAG);
}
```

- [ ] **Step 3: Verify types compile and existing tests pass**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other Entry construction broke).

Run: `npx vitest run`
Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/db/entries-repo.ts
git commit -m "feat: per-entry settings (JSONB) with updateSettings"
```

---

### Task 8: `pick-overrides-repo`

**Files:**
- Create: `src/lib/db/pick-overrides-repo.ts`

- [ ] **Step 1: Implement the repo**

Create `src/lib/db/pick-overrides-repo.ts`:

```ts
import { sql } from "./client";

export type OverrideOutcome = "survived" | "out";
export type Overrides = Record<number, OverrideOutcome>;

export async function getOverrides(entryId: string): Promise<Overrides> {
  const rows = (await sql`
    SELECT week, outcome FROM pick_overrides WHERE entry_id = ${entryId}
  `) as unknown as { week: number; outcome: OverrideOutcome }[];
  return Object.fromEntries(rows.map((r) => [r.week, r.outcome]));
}

export async function setOverride(
  entryId: string,
  week: number,
  outcome: OverrideOutcome,
): Promise<void> {
  await sql`
    INSERT INTO pick_overrides (entry_id, week, outcome)
    VALUES (${entryId}, ${week}, ${outcome})
    ON CONFLICT (entry_id, week) DO UPDATE SET outcome = EXCLUDED.outcome
  `;
}

export async function clearOverride(entryId: string, week: number): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM pick_overrides WHERE entry_id = ${entryId} AND week = ${week} RETURNING week
  `) as unknown[];
  return rows.length > 0;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/pick-overrides-repo.ts
git commit -m "feat: pick_overrides repo (get/set/clear)"
```

---

### Task 9: Shared `getEntryStatuses` helper

**Files:**
- Create: `src/lib/entry-status.ts`

- [ ] **Step 1: Implement the helper**

Create `src/lib/entry-status.ts`:

```ts
import { getEntries } from "./db/entries-repo";
import { getPicks } from "./db/picks-repo";
import { getOverrides } from "./db/pick-overrides-repo";
import { deriveEntryStatus, type EntryStatus } from "./elimination";
import type { Entry, GameResult, TeamAbbr } from "./types";

export interface EntryWithStatus {
  entry: Entry;
  picksByWeek: Record<number, TeamAbbr>;
  status: EntryStatus;
}

/** Load every entry with its picks and derived elimination status. */
export async function getEntryStatuses(results: GameResult[]): Promise<EntryWithStatus[]> {
  const entries = await getEntries();
  const out: EntryWithStatus[] = [];
  for (const e of entries) {
    const picks = await getPicks(e.id);
    const picksByWeek = Object.fromEntries(picks.map((p) => [p.week, p.team]));
    const overrides = await getOverrides(e.id);
    const tiesSurvive = e.settings.ties_survive ?? true;
    const status = deriveEntryStatus(picksByWeek, results, overrides, tiesSurvive);
    out.push({ entry: e, picksByWeek, status });
  }
  return out;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/entry-status.ts
git commit -m "feat: shared getEntryStatuses helper"
```

---

### Task 10: Wire real outcomes + elimination into recommendations

**Files:**
- Modify: `src/app/api/recommendations/route.ts`

- [ ] **Step 1: Use derived status for outcomes, elimination, and sorting**

In `src/app/api/recommendations/route.ts`, add imports:

```ts
import { getEntryStatuses } from "@/lib/entry-status";
```

After `const results = await getResultsFresh(...)` (added in Task 4), add:

```ts
  const statuses = await getEntryStatuses(results);
  const statusByName = Object.fromEntries(statuses.map((s) => [s.entry.name, s.status]));
```

Replace the Task-4 `resultsByWeek` mapping so it passes the real `byWeek` outcomes and adds elimination flags. The `data = recs.map((r) => ...)` body becomes:

```ts
  const data = recs.map((r) => {
    const status = statusByName[r.entry];
    const eliminated = status?.eliminated ?? false;
    return resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      // Eliminated entries get no suggested pick.
      pick: eliminated ? null : r.pick,
      eliminated,
      eliminatedWeek: status?.eliminatedWeek ?? null,
      currentPick: week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null,
      picksByWeek: picksByWeekByEntry[r.entry] ?? {},
      resultsByWeek: pickResultViews(
        Object.fromEntries(
          Object.entries(picksByWeekByEntry[r.entry] ?? {}).map(([w, t]) => [Number(w), t]),
        ),
        results,
        status?.byWeek ?? {},
      ),
    });
  });
  // Alive entries first, then eliminated, each group keeping the name order.
  data.sort((a, b) => Number(a.attributes.eliminated) - Number(b.attributes.eliminated));
```

- [ ] **Step 2: Verify the API**

Run: `curl -s 'http://localhost:3000/api/recommendations?safetyFloor=0.6' | python3 -m json.tool | grep -E 'eliminated|outcome' | head`
Expected: each recommendation has `eliminated` / `eliminatedWeek`, and `resultsByWeek[*].outcome` now reflects won/lost/tie/live/pending. Eliminated entries appear last with `pick: null`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recommendations/route.ts
git commit -m "feat: recommendations reflect elimination status and real outcomes"
```

---

### Task 11: `/api/entries` returns status; grid & calendar filter eliminated

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Modify: `src/app/grid/page.tsx`
- Modify: `src/app/calendar/page.tsx`

(Matchups has no per-entry dimension, so nothing to exclude there.)

- [ ] **Step 1: Add status to the entries list**

Replace `GET` in `src/app/api/entries/route.ts` with:

```ts
export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const week = currentWeek(schedule, new Date());
  const results = await getResultsFresh(week, Number(process.env.NFL_SEASON ?? "2026"));
  const statuses = await getEntryStatuses(results);
  const data = statuses.map(({ entry, status }) =>
    resource("entry", entry.id, {
      name: entry.name,
      settings: entry.settings,
      eliminated: status.eliminated,
      eliminatedWeek: status.eliminatedWeek,
    }),
  );
  return jsonApi(document(data));
}
```

Add the needed imports at the top of the file:

```ts
import { getCache } from "@/lib/db/cache-repo";
import { getResultsFresh } from "@/lib/sources/results";
import { getEntryStatuses } from "@/lib/entry-status";
import { currentWeek } from "@/lib/week";
import type { Matchup } from "@/lib/types";
```

- [ ] **Step 2: Filter eliminated entries out of the grid dropdown**

In `src/app/grid/page.tsx`, the effect that populates `entryNames` (around line 25) maps `doc.data` to names. Change it to keep only non-eliminated entries. Replace the `.then(...)` that sets entry names with:

```ts
      .then((doc) =>
        setEntryNames(
          (doc.data ?? [])
            .filter((d: { attributes: { eliminated?: boolean } }) => !d.attributes.eliminated)
            .map((d: { attributes: { name: string } }) => d.attributes.name),
        ),
      );
```

- [ ] **Step 3: Filter eliminated entries out of the calendar dropdown**

In `src/app/calendar/page.tsx`, apply the same change to its `/api/entries` `.then(...)` (around line 25):

```ts
      .then((doc) =>
        setEntryNames(
          (doc.data ?? [])
            .filter((d: { attributes: { eliminated?: boolean } }) => !d.attributes.eliminated)
            .map((d: { attributes: { name: string } }) => d.attributes.name),
        ),
      );
```

- [ ] **Step 4: Verify**

Run: `curl -s http://localhost:3000/api/entries | python3 -m json.tool`
Expected: each entry has `name`, `settings`, `eliminated`, `eliminatedWeek`.

In the browser, on `/grid` and `/calendar`, confirm the entry dropdown omits any eliminated entry.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/entries/route.ts src/app/grid/page.tsx src/app/calendar/page.tsx
git commit -m "feat: entries API exposes status; grid & calendar hide eliminated entries"
```

---

### Task 12: `PATCH /api/entries/[id]` for the ties toggle

**Files:**
- Modify: `src/app/api/entries/[id]/route.ts`

- [ ] **Step 1: Add the PATCH handler**

Replace the contents of `src/app/api/entries/[id]/route.ts` with:

```ts
import { deleteEntry, updateSettings } from "@/lib/db/entries-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import type { EntrySettings } from "@/lib/types";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const settings = body?.data?.attributes?.settings as EntrySettings | undefined;
  if (!settings || typeof settings !== "object") {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "A settings object is required" }]),
      400,
    );
  }
  await updateSettings(id, settings);
  return jsonApi(metaDocument({ ok: true }));
}
```

- [ ] **Step 2: Verify**

Run (substitute a real id from `/api/entries`, e.g. `jon`):

```bash
curl -s -X PATCH http://localhost:3000/api/entries/jon \
  -H 'content-type: application/vnd.api+json' \
  -d '{"data":{"attributes":{"settings":{"ties_survive":false}}}}' | python3 -m json.tool
```

Expected: `{"meta": {"ok": true}}`. Then `curl -s http://localhost:3000/api/entries` shows `jon`'s `settings.ties_survive` = false. (Restore it to true afterward.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/entries/[id]/route.ts"
git commit -m "feat: PATCH /api/entries/[id] to update per-entry settings"
```

---

### Task 13: `/api/pick-override` route

**Files:**
- Create: `src/app/api/pick-override/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/pick-override/route.ts`:

```ts
import { setOverride, clearOverride, type OverrideOutcome } from "@/lib/db/pick-overrides-repo";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

interface Attrs { entry: string; week: number; outcome: OverrideOutcome }

async function readAttrs(req: Request): Promise<Partial<Attrs>> {
  const body = await req.json().catch(() => ({}));
  return body?.data?.attributes ?? {};
}

export async function POST(req: Request) {
  const { entry, week, outcome } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || week === undefined || (outcome !== "survived" && outcome !== "out")) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid override", detail: "entry, week, and outcome (survived|out) are required" }]),
      400,
    );
  }
  await setOverride(entryId, week, outcome);
  return jsonApi(document(resource("pick-override", `${entryId}:${week}`, { entry, week, outcome })), 201);
}

export async function DELETE(req: Request) {
  const { entry, week } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || week === undefined) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid request", detail: "entry and week are required" }]),
      400,
    );
  }
  const deleted = await clearOverride(entryId, week);
  return jsonApi(metaDocument({ deleted }));
}
```

- [ ] **Step 2: Verify**

```bash
curl -s -X POST http://localhost:3000/api/pick-override \
  -H 'content-type: application/vnd.api+json' \
  -d '{"data":{"attributes":{"entry":"Jon","week":1,"outcome":"survived"}}}' | python3 -m json.tool
```

Expected: `201` with a `pick-override` resource. Confirm `/api/recommendations` now shows Jon's Week 1 outcome as `won` regardless of the real result. Then clear it:

```bash
curl -s -X DELETE http://localhost:3000/api/pick-override \
  -H 'content-type: application/vnd.api+json' \
  -d '{"data":{"attributes":{"entry":"Jon","week":1}}}' | python3 -m json.tool
```

Expected: `{"meta": {"deleted": true}}`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pick-override/route.ts
git commit -m "feat: /api/pick-override to set/clear per-week outcome overrides"
```

---

### Task 14: Dashboard — eliminated card, ties toggle, override actions

**Files:**
- Modify: `src/app/dashboard-client.tsx`

- [ ] **Step 1: Extend the `Rec` type and add write helpers**

In `src/app/dashboard-client.tsx`, add `eliminated` / `eliminatedWeek` to the `Rec` type (extend the type from Task 4):

```ts
type Rec = Recommendation & {
  currentPick?: string | null;
  entryId?: string;
  picksByWeek?: Record<number, string>;
  eliminated?: boolean;
  eliminatedWeek?: number | null;
  settings?: { ties_survive?: boolean };
  resultsByWeek?: Record<number, {
    week: number; team: string; outcome: "won" | "lost" | "tie" | "pending" | "live";
    teamScore: number | null; oppScore: number | null; opponent: string | null; statusDetail: string;
  }>;
};
```

The recommendations resource does not include `settings`; fetch it alongside. In `load()`, after building `recsWithId`, merge in each entry's settings from `/api/entries`. Replace the body of `load()` with:

```ts
  async function load() {
    setLoading(true);
    const [recDoc, entriesDoc] = await Promise.all([
      fetch(`/api/recommendations?safetyFloor=${floor}`).then((r) => r.json()),
      fetch(`/api/entries`).then((r) => r.json()),
    ]);
    const settingsByName: Record<string, { ties_survive?: boolean }> = Object.fromEntries(
      (entriesDoc.data ?? []).map((d: { attributes: { name: string; settings?: { ties_survive?: boolean } } }) =>
        [d.attributes.name, d.attributes.settings ?? {}]),
    );
    const recsWithId: Rec[] = (recDoc.data ?? []).map(
      (d: { id: string; attributes: Rec }) => ({
        ...d.attributes,
        entryId: d.id,
        settings: settingsByName[d.attributes.entry] ?? {},
      }),
    );
    setRecs(recsWithId);
    setWeeks(recDoc.meta?.weeks ?? []);
    setLoading(false);
  }
```

Add these write helpers near the other actions (e.g. after `undo`):

```ts
  async function setTiesSurvive(r: Rec, value: boolean) {
    await fetch(`/api/entries/${r.entryId ?? ""}`, {
      method: "PATCH",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { attributes: { settings: { ...(r.settings ?? {}), ties_survive: value } } } }),
    });
    load();
  }

  async function overrideWeek(entry: string, week: number, outcome: "survived" | "out") {
    await fetch("/api/pick-override", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick-override", attributes: { entry, week, outcome } } }),
    });
    setPickModal(null);
    load();
  }

  async function clearOverrideWeek(entry: string, week: number) {
    await fetch("/api/pick-override", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { attributes: { entry, week } } }),
    });
    setPickModal(null);
    load();
  }
```

- [ ] **Step 2: Give eliminated cards a distinct treatment**

In the card `<div>` (around line 208), make the container style conditional and add the badge + ties toggle. Replace the opening of the card and its header block (lines 208–256, from the card `<div key={r.entry}...>` through the end of the suggested/picked conditional) with:

```tsx
          <div
            key={r.entry}
            className={`rounded-xl border bg-white p-4 shadow-sm ${
              r.eliminated ? "border-red-300 bg-red-50/40 opacity-80" : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-bold ${r.eliminated ? "text-red-700" : ""}`}>{r.entry}</h2>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-slate-500" title="A tie counts as surviving in this entry's league">
                  <input
                    type="checkbox"
                    checked={r.settings?.ties_survive ?? true}
                    onChange={(e) => setTiesSurvive(r, e.target.checked)}
                    className="accent-emerald-600"
                  />
                  tie=safe
                </label>
                <button
                  onClick={() => removeEntry(r)}
                  title="Delete entry"
                  className="text-slate-300 transition-colors hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            </div>

            {r.eliminated ? (
              <div className="mt-2">
                <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Eliminated{r.eliminatedWeek ? ` — Week ${r.eliminatedWeek}` : ""}
                </span>
              </div>
            ) : r.currentPick ? (
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <TeamLogo abbr={r.currentPick} size={40} />
                  <span className="text-2xl font-bold">{r.currentPick}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    ✓ picked
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">Locked in for Week {r.week}.</p>
                <button onClick={() => undo(r)} className="mt-3 text-sm text-slate-500 underline">
                  Undo pick
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Suggested</p>
                <div className="mt-1 flex items-center gap-3">
                  {r.pick && <TeamLogo abbr={r.pick} size={40} />}
                  <span className="text-2xl font-bold">{r.pick ?? "—"}</span>
                  {r.pick && <WinProbPill prob={r.prob} />}
                </div>
                <p className="mt-2 text-sm text-slate-600">{r.reasoning}</p>
                {r.greedyAlt && r.greedyAlt.team !== r.pick && (
                  <p className="mt-1 text-xs text-slate-400">
                    Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
                  </p>
                )}
                <button
                  onClick={() => confirm(r)}
                  disabled={!r.pick}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  Confirm pick
                </button>
              </div>
            )}
```

(Cards already come from the API alive-first, then eliminated — the sort in Task 10 handles ordering.)

- [ ] **Step 3: Add override actions to the pick modal**

In the pick modal, add "Mark survived / Mark out / Clear override" controls. After the `pickModal.current` block (the `<div>` ending around line 321, before the `<p>Available teams…</p>`), insert:

```tsx
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">Result override:</span>
              <button
                onClick={() => overrideWeek(pickModal.entry, pickModal.week, "survived")}
                className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-200"
              >
                Mark survived
              </button>
              <button
                onClick={() => overrideWeek(pickModal.entry, pickModal.week, "out")}
                className="rounded bg-red-100 px-2 py-1 font-medium text-red-700 hover:bg-red-200"
              >
                Mark out
              </button>
              <button
                onClick={() => clearOverrideWeek(pickModal.entry, pickModal.week)}
                className="rounded px-2 py-1 text-slate-500 underline"
              >
                Clear
              </button>
            </div>
```

- [ ] **Step 4: Manually verify the full flow**

Open `http://localhost:3000`:
1. Toggle a card's `tie=safe` checkbox → persists across reload (check `/api/entries`).
2. Open a week cell for an entry whose pick lost → "Mark survived" → card is no longer eliminated; the cell turns green.
3. On a later week that also lost, confirm the entry is eliminated at that later week (badge shows the later week).
4. "Mark out" on a winning week → card shows Eliminated at that week; entry drops to the bottom and disappears from `/grid` and `/calendar` dropdowns.
5. "Clear" → reverts to the auto-derived outcome.

- [ ] **Step 5: Full test + typecheck + commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

```bash
git add src/app/dashboard-client.tsx
git commit -m "feat: eliminated-card treatment, tie toggle, and per-week override controls"
```

---

## Self-Review Notes

- **Spec coverage:** results parser (T1), 60s live cache (T2), score display (T3–T4), schema settings+overrides (T5), elimination derivation with per-week overrides + tie rule (T6), repos (T7–T8), shared status helper (T9), recommendations integration + sort + no-suggestion (T10), entries API + grid/calendar exclusion (T11), ties toggle API (T12) + UI (T14), override API (T13) + UI (T14), green/red/live shading (T4 + T14). Matchups exclusion is intentionally a no-op (no per-entry dimension) — noted in T11.
- **Type consistency:** `GameResult`, `PickOutcome`, `EntrySettings`, `Entry.settings`, `EntryStatus`, `PickResultView`, `OverrideOutcome`/`Overrides` are defined once and reused. `deriveEntryStatus`, `outcomeForWeek`, `pickResultViews`, `getEntryStatuses`, `getResultsFresh`, `mergeResults`, `shouldRefetch`, `getOverrides`/`setOverride`/`clearOverride`, `updateSettings` names match across tasks.
- **Ordering:** Phase 1 never touches `Entry.settings`; the `Entry` change (T7) is paired with its repo update so the build stays green between commits.
</content>
</invoke>
