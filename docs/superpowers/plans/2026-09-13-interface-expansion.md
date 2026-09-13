# Interface Expansion + JSON:API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Matchups page (research + manual pick with undo) and a season Calendar grid, and migrate every API endpoint to the JSON:API contract.

**Architecture:** A single `src/lib/jsonapi.ts` defines the response/error/query-param contract; all routes compose it. A pure `buildGameViews` helper reshapes cached data for the Matchups page. Existing routes + their React clients are migrated to the JSON:API envelope; two new pages and three new routes are added; a shared `Nav` lives in the root layout.

**Tech Stack:** Next.js 15 App Router + TypeScript, Vitest, `@neondatabase/serverless`, deployed on Vercel.

---

## File Structure

```
src/lib/
  jsonapi.ts            # NEW: resource/document/metaDocument/errorDocument/jsonApi/getFilter
  jsonapi-client.ts     # NEW: unwrapMany/unwrapOne (client-side envelope parsing)
  game-views.ts         # NEW: buildGameViews (per-game odds + de-vigged prob + source)
  types.ts              # MODIFY: add GameView
  db/picks-repo.ts      # MODIFY: add removePick
src/app/
  layout.tsx            # MODIFY: render <Nav/>
  nav.tsx               # NEW: shared nav
  page.tsx / dashboard-client.tsx  # MODIFY: JSON:API parse + safetyFloor
  grid/page.tsx         # MODIFY: JSON:API parse + filter[entry]
  log/page.tsx          # MODIFY: JSON:API parse
  matchups/page.tsx     # NEW
  calendar/page.tsx     # NEW
  api/recommendations/route.ts  # MODIFY → JSON:API
  api/grid/route.ts             # MODIFY → JSON:API + filter[entry]
  api/log/route.ts              # MODIFY → JSON:API
  api/pick/route.ts             # MODIFY → JSON:API POST + add DELETE
  api/refresh/route.ts          # MODIFY → JSON:API meta
  api/cron/refresh/route.ts     # MODIFY → JSON:API meta
  api/matchups/route.ts         # NEW
  api/schedule/route.ts         # NEW
  api/picks-state/route.ts      # NEW
```

---

## Task 1: JSON:API contract helpers

**Files:**
- Create: `src/lib/jsonapi.ts`, `tests/lib/jsonapi.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/jsonapi.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  resource, document, metaDocument, errorDocument, jsonApi, getFilter,
} from "@/lib/jsonapi";

describe("jsonapi helpers", () => {
  it("builds a resource object", () => {
    expect(resource("game", "1:NYJ@BUF", { week: 1 })).toEqual({
      type: "game", id: "1:NYJ@BUF", attributes: { week: 1 },
    });
  });
  it("wraps data with optional meta", () => {
    expect(document([{ type: "t", id: "1", attributes: {} }])).toEqual({
      data: [{ type: "t", id: "1", attributes: {} }],
    });
    expect(document({ type: "t", id: "1", attributes: {} }, { currentWeek: 2 })).toEqual({
      data: { type: "t", id: "1", attributes: {} }, meta: { currentWeek: 2 },
    });
  });
  it("builds meta-only and error documents", () => {
    expect(metaDocument({ ok: true })).toEqual({ meta: { ok: true } });
    expect(errorDocument([{ status: "409", title: "Conflict" }])).toEqual({
      errors: [{ status: "409", title: "Conflict" }],
    });
  });
  it("getFilter reads the filter[key] query param", () => {
    const req = new Request("http://x/api/matchups?filter%5Bweek%5D=3");
    expect(getFilter(req, "week")).toBe("3");
    expect(getFilter(new Request("http://x/api/matchups"), "week")).toBeNull();
  });
  it("jsonApi sets status and the JSON:API content type", async () => {
    const res = jsonApi(metaDocument({ ok: true }), 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/vnd.api+json");
    expect(await res.json()).toEqual({ meta: { ok: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/jsonapi.test.ts`
Expected: FAIL — cannot find module `@/lib/jsonapi`.

- [ ] **Step 3: Write `src/lib/jsonapi.ts`**

```ts
import { NextResponse } from "next/server";

export interface ResourceObject<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: A;
}
export interface JsonApiError {
  status: string;
  title: string;
  detail?: string;
}

export function resource<A>(type: string, id: string, attributes: A): ResourceObject<A> {
  return { type, id, attributes };
}

export function document<A>(
  data: ResourceObject<A> | ResourceObject<A>[],
  meta?: Record<string, unknown>,
): { data: ResourceObject<A> | ResourceObject<A>[]; meta?: Record<string, unknown> } {
  return meta === undefined ? { data } : { data, meta };
}

export function metaDocument(meta: Record<string, unknown>): { meta: Record<string, unknown> } {
  return { meta };
}

export function errorDocument(errors: JsonApiError[]): { errors: JsonApiError[] } {
  return { errors };
}

const CONTENT_TYPE = "application/vnd.api+json";

export function jsonApi(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "content-type": CONTENT_TYPE } });
}

/** Reads a JSON:API filter param, e.g. getFilter(req, "week") → ?filter[week]=... */
export function getFilter(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(`filter[${key}]`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/jsonapi.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonapi.ts tests/lib/jsonapi.test.ts
git commit -m "feat: add JSON:API contract helpers"
```

---

## Task 2: Client-side envelope unwrap helpers

**Files:**
- Create: `src/lib/jsonapi-client.ts`, `tests/lib/jsonapi-client.test.ts`

- [ ] **Step 1: Write the failing test `tests/lib/jsonapi-client.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { unwrapMany, unwrapOne } from "@/lib/jsonapi-client";

describe("jsonapi client unwrap", () => {
  it("unwrapMany returns the attributes of each resource", () => {
    const doc = { data: [
      { type: "t", id: "1", attributes: { a: 1 } },
      { type: "t", id: "2", attributes: { a: 2 } },
    ] };
    expect(unwrapMany(doc)).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it("unwrapMany tolerates a missing data array", () => {
    expect(unwrapMany({} as any)).toEqual([]);
  });
  it("unwrapOne returns a single resource's attributes", () => {
    expect(unwrapOne({ data: { type: "t", id: "1", attributes: { a: 9 } } })).toEqual({ a: 9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/jsonapi-client.test.ts`
Expected: FAIL — cannot find module `@/lib/jsonapi-client`.

- [ ] **Step 3: Write `src/lib/jsonapi-client.ts`**

```ts
export interface Resource<A> { type: string; id: string; attributes: A }

export function unwrapMany<A>(doc: { data?: Resource<A>[] }): A[] {
  return (doc.data ?? []).map((r) => r.attributes);
}

export function unwrapOne<A>(doc: { data: Resource<A> }): A {
  return doc.data.attributes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/jsonapi-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonapi-client.ts tests/lib/jsonapi-client.test.ts
git commit -m "feat: add client-side JSON:API unwrap helpers"
```

---

## Task 3: GameView type + buildGameViews

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/game-views.ts`, `tests/lib/game-views.test.ts`

- [ ] **Step 1: Add `GameView` to `src/lib/types.ts`**

Append:
```ts
export interface GameView {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string;
  homeOdds: number | null; // consensus American line, null when unposted (FPI source)
  awayOdds: number | null;
  homeProb: number;
  awayProb: number;
  source: "odds" | "fpi";
}
```

- [ ] **Step 2: Write the failing test `tests/lib/game-views.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGameViews } from "@/lib/game-views";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "BUF", away: "KC", kickoff: "2026-09-17T00:00:00Z" },
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "NYJ", fpi: -2 },
  { team: "KC", fpi: 8 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [
  { week: 1, home: "BUF", away: "NYJ", homeOdds: -300, awayOdds: 250 },
];

describe("buildGameViews", () => {
  it("uses de-vigged odds when a line is posted", () => {
    const gv = buildGameViews(schedule, strengths, odds, 1);
    const buf = gv.find((g) => g.home === "BUF")!;
    expect(buf.source).toBe("odds");
    expect(buf.homeOdds).toBe(-300);
    expect(buf.awayOdds).toBe(250);
    expect(buf.homeProb).toBeGreaterThan(buf.awayProb);
    expect(buf.homeProb + buf.awayProb).toBeCloseTo(1, 6);
  });
  it("falls back to FPI (null odds, complementary probs) when unposted", () => {
    const gv = buildGameViews(schedule, strengths, odds, 1);
    const kc = gv.find((g) => g.home === "KC")!;
    expect(kc.source).toBe("fpi");
    expect(kc.homeOdds).toBeNull();
    expect(kc.homeProb + kc.awayProb).toBeCloseTo(1, 6);
  });
  it("only returns the requested week", () => {
    const gv = buildGameViews(schedule, strengths, odds, 2);
    expect(gv.length).toBe(1);
    expect(gv[0].week).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/game-views.test.ts`
Expected: FAIL — cannot find module `@/lib/game-views`.

- [ ] **Step 4: Write `src/lib/game-views.ts`**

```ts
import type { Matchup, TeamStrength, MoneylineGame, GameView } from "./types";
import { devigTwoWay } from "./odds";
import { projectWinProb } from "./projection";

export function buildGameViews(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  week: number,
): GameView[] {
  const fpi = new Map(strengths.map((s) => [s.team, s.fpi]));
  const key = (w: number, h: string, a: string) => `${w}:${h}:${a}`;
  const oddsMap = new Map(odds.map((o) => [key(o.week, o.home, o.away), o]));
  const out: GameView[] = [];

  for (const g of schedule) {
    if (g.week !== week) continue;
    const posted = oddsMap.get(key(g.week, g.home, g.away));
    if (posted) {
      const { favProb, dogProb } = devigTwoWay(posted.homeOdds, posted.awayOdds);
      out.push({
        week: g.week, home: g.home, away: g.away, kickoff: g.kickoff,
        homeOdds: posted.homeOdds, awayOdds: posted.awayOdds,
        homeProb: favProb, awayProb: dogProb, source: "odds",
      });
    } else {
      const homeProb = projectWinProb(fpi.get(g.home) ?? 0, fpi.get(g.away) ?? 0, true);
      const awayProb = projectWinProb(fpi.get(g.away) ?? 0, fpi.get(g.home) ?? 0, false);
      out.push({
        week: g.week, home: g.home, away: g.away, kickoff: g.kickoff,
        homeOdds: null, awayOdds: null, homeProb, awayProb, source: "fpi",
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/game-views.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/game-views.ts tests/lib/game-views.test.ts
git commit -m "feat: add GameView type and buildGameViews"
```

---

## Task 4: removePick repository function

**Files:**
- Modify: `src/lib/db/picks-repo.ts`

- [ ] **Step 1: Add `removePick` to `src/lib/db/picks-repo.ts`**

Append after `getUsedTeams`:
```ts
export async function removePick(entryId: string, week: number): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM picks WHERE entry_id = ${entryId} AND week = ${week} RETURNING id
  `) as unknown[];
  return rows.length > 0;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/picks-repo.ts
git commit -m "feat: add removePick repository function"
```

---

## Task 5: Migrate recommendations route + dashboard client to JSON:API

**Files:**
- Modify: `src/app/api/recommendations/route.ts`, `src/app/dashboard-client.tsx`

- [ ] **Step 1: Rewrite `src/app/api/recommendations/route.ts`**

```ts
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { ENTRIES, NAME_TO_ID } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

export async function GET(req: Request) {
  const safetyFloor = Number(new URL(req.url).searchParams.get("safetyFloor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const picksByEntry: Record<string, Set<TeamAbbr>> = {};
  for (const e of ENTRIES) picksByEntry[e.name] = await getUsedTeams(e.id);

  const recs = buildRecommendations(schedule, strengths, odds, picksByEntry, new Date(), safetyFloor);
  const data = recs.map((r) => resource("recommendation", NAME_TO_ID[r.entry] ?? r.entry, r));
  return jsonApi(document(data, { currentWeek: recs[0]?.week ?? null, safetyFloor }));
}
```

- [ ] **Step 2: Update `src/app/dashboard-client.tsx` to parse JSON:API and send `safetyFloor`**

Replace the `load` function and the `confirm` fetch body:
```tsx
  async function load() {
    setLoading(true);
    const res = await fetch(`/api/recommendations?safetyFloor=${floor}`);
    const doc = await res.json();
    setRecs(unwrapMany<Recommendation>(doc));
    setLoading(false);
  }
```
And the confirm POST:
```tsx
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({
        data: { type: "pick", attributes: { entry: r.entry, week: r.week, team: r.pick, winProb: r.prob } },
      }),
    });
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Pick failed");
    } else load();
```
Add the import at the top:
```tsx
import { unwrapMany } from "@/lib/jsonapi-client";
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/recommendations/route.ts src/app/dashboard-client.tsx
git commit -m "feat: migrate recommendations route + dashboard to JSON:API"
```

---

## Task 6: Migrate grid route + grid client (filter[entry])

**Files:**
- Modify: `src/app/api/grid/route.ts`, `src/app/grid/page.tsx`

- [ ] **Step 1: Rewrite `src/app/api/grid/route.ts`**

```ts
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import { NAME_TO_ID, ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const entry = getFilter(req, "entry") ?? ENTRIES[0].name;
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(NAME_TO_ID[entry] ?? ENTRIES[0].id);
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  const data = wps.map((w) => resource("winprob", `${w.week}:${w.team}`, w));
  return jsonApi(document(data, { week, entry }));
}
```

- [ ] **Step 2: Update `src/app/grid/page.tsx`**

Change the fetch + parse and add the import:
```tsx
import { unwrapMany } from "@/lib/jsonapi-client";
```
```tsx
  useEffect(() => {
    fetch(`/api/grid?filter[entry]=${encodeURIComponent(entry)}`)
      .then((r) => r.json())
      .then((doc) => setWps(unwrapMany<WinProb>(doc)));
  }, [entry]);
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/grid/route.ts src/app/grid/page.tsx
git commit -m "feat: migrate grid route + client to JSON:API with filter[entry]"
```

---

## Task 7: Migrate log route + log client to JSON:API

**Files:**
- Modify: `src/app/api/log/route.ts`, `src/app/log/page.tsx`

- [ ] **Step 1: Rewrite `src/app/api/log/route.ts`**

```ts
import { getPicks } from "@/lib/db/picks-repo";
import { ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";

export async function GET() {
  const data = [];
  for (const e of ENTRIES) {
    const picks = await getPicks(e.id);
    for (const p of picks) {
      data.push(resource("pick", `${e.id}:${p.week}`, { entry: e.name, week: p.week, team: p.team }));
    }
  }
  return jsonApi(document(data));
}
```

- [ ] **Step 2: Update `src/app/log/page.tsx` to parse JSON:API and group by entry**

```tsx
"use client";
import { useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";

interface PickAttrs { entry: string; week: number; team: string }

export default function LogPage() {
  const [picks, setPicks] = useState<PickAttrs[]>([]);
  useEffect(() => {
    fetch("/api/log").then((r) => r.json()).then((doc) => setPicks(unwrapMany<PickAttrs>(doc)));
  }, []);

  const byEntry = new Map<string, PickAttrs[]>();
  for (const p of picks) {
    if (!byEntry.has(p.entry)) byEntry.set(p.entry, []);
    byEntry.get(p.entry)!.push(p);
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Pick Log</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {[...byEntry.entries()].map(([entry, ps]) => (
          <div key={entry}>
            <h3>{entry}</h3>
            <ol>
              {ps.sort((a, b) => a.week - b.week).map((p) => <li key={p.week}>W{p.week}: {p.team}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/log/route.ts src/app/log/page.tsx
git commit -m "feat: migrate log route + client to JSON:API"
```

---

## Task 8: Migrate pick route (JSON:API POST) + add DELETE

**Files:**
- Modify: `src/app/api/pick/route.ts`

- [ ] **Step 1: Rewrite `src/app/api/pick/route.ts`**

```ts
import { recordPick, removePick } from "@/lib/db/picks-repo";
import { NAME_TO_ID } from "@/lib/entries";
import { resource, document, metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

interface PickAttrs { entry: string; week: number; team: string; winProb?: number }

async function readAttrs(req: Request): Promise<Partial<PickAttrs>> {
  const body = await req.json().catch(() => ({}));
  return body?.data?.attributes ?? {};
}

export async function POST(req: Request) {
  const { entry, week, team, winProb } = await readAttrs(req);
  const entryId = entry ? NAME_TO_ID[entry] : undefined;
  if (!entryId || week === undefined || !team) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid pick", detail: "entry, week, and team are required" }]), 400);
  }
  try {
    await recordPick(entryId, week, team, winProb ?? 0);
    return jsonApi(
      document(resource("pick", `${entryId}:${week}`, { entry, week, team, winProb: winProb ?? 0 })),
      201,
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return jsonApi(errorDocument([{ status: "409", title: "Pick conflict", detail }]), 409);
  }
}

export async function DELETE(req: Request) {
  const { entry, week } = await readAttrs(req);
  const entryId = entry ? NAME_TO_ID[entry] : undefined;
  if (!entryId || week === undefined) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "entry and week are required" }]), 400);
  }
  const deleted = await removePick(entryId, week);
  return jsonApi(metaDocument({ deleted }));
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds; `/api/pick` shows POST + DELETE.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pick/route.ts
git commit -m "feat: migrate pick POST to JSON:API and add DELETE (undo)"
```

---

## Task 9: Migrate refresh + cron routes to JSON:API meta

**Files:**
- Modify: `src/app/api/refresh/route.ts`, `src/app/api/cron/refresh/route.ts`

- [ ] **Step 1: Rewrite `src/app/api/refresh/route.ts`**

```ts
import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, jsonApi } from "@/lib/jsonapi";

export async function POST() {
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString() }));
}
```

- [ ] **Step 2: Rewrite `src/app/api/cron/refresh/route.ts`**

```ts
import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonApi(errorDocument([{ status: "401", title: "Unauthorized" }]), 401);
  }
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString() }));
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/refresh/route.ts src/app/api/cron/refresh/route.ts
git commit -m "feat: migrate refresh + cron routes to JSON:API meta documents"
```

---

## Task 10: New matchups route

**Files:**
- Create: `src/app/api/matchups/route.ts`

- [ ] **Step 1: Write `src/app/api/matchups/route.ts`**

```ts
import { getCache } from "@/lib/db/cache-repo";
import { buildGameViews } from "@/lib/game-views";
import { currentWeek } from "@/lib/week";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const cur = currentWeek(schedule, new Date());
  const wkParam = getFilter(req, "week");
  const week = wkParam ? Number(wkParam) : cur;

  const games = buildGameViews(schedule, strengths, odds, week);
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = games.map((g) => resource("game", `${g.week}:${g.away}@${g.home}`, g));
  return jsonApi(document(data, { currentWeek: cur, week, weeks }));
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/api/matchups` listed.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/matchups/route.ts
git commit -m "feat: add matchups route (games with odds + de-vigged probs)"
```

---

## Task 11: New schedule + picks-state routes

**Files:**
- Create: `src/app/api/schedule/route.ts`, `src/app/api/picks-state/route.ts`

- [ ] **Step 1: Write `src/app/api/schedule/route.ts`**

```ts
import { getCache } from "@/lib/db/cache-repo";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = schedule.map((g) => resource("game", `${g.week}:${g.away}@${g.home}`, g));
  return jsonApi(document(data, { weeks }));
}
```

- [ ] **Step 2: Write `src/app/api/picks-state/route.ts`**

```ts
import { getCache } from "@/lib/db/cache-repo";
import { getPicks } from "@/lib/db/picks-repo";
import { currentWeek } from "@/lib/week";
import { ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const cur = currentWeek(schedule, new Date());
  const data = [];
  for (const e of ENTRIES) {
    const picks = await getPicks(e.id);
    const usedTeams = picks.map((p) => p.team);
    const picksByWeek: Record<number, string> = {};
    for (const p of picks) picksByWeek[p.week] = p.team;
    data.push(resource("entry", e.id, { name: e.name, usedTeams, picksByWeek }));
  }
  return jsonApi(document(data, { currentWeek: cur }));
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; both routes listed.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/schedule/route.ts src/app/api/picks-state/route.ts
git commit -m "feat: add schedule and picks-state routes"
```

---

## Task 12: Shared Nav in the root layout

**Files:**
- Create: `src/app/nav.tsx`
- Modify: `src/app/layout.tsx`, and remove ad-hoc footer links from `dashboard-client.tsx`, `grid/page.tsx`, `log/page.tsx`

- [ ] **Step 1: Write `src/app/nav.tsx`**

```tsx
export default function Nav() {
  const link = { marginRight: 12 };
  return (
    <nav style={{ fontFamily: "system-ui", padding: "12px 24px", borderBottom: "1px solid #eee", fontSize: 14 }}>
      <a href="/" style={link}>Dashboard</a>
      <a href="/matchups" style={link}>Matchups</a>
      <a href="/calendar" style={link}>Calendar</a>
      <a href="/grid" style={link}>Grid</a>
      <a href="/log" style={link}>Log</a>
    </nav>
  );
}
```

- [ ] **Step 2: Render `<Nav/>` in `src/app/layout.tsx`**

```tsx
import Nav from "./nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Remove the old footer links**

In `src/app/dashboard-client.tsx` delete the block:
```tsx
      <p style={{ marginTop: 24 }}>
        <a href="/grid">Grid view</a> · <a href="/log">Pick log</a>
      </p>
```
In `src/app/grid/page.tsx` delete:
```tsx
      <p style={{ marginTop: 24 }}><a href="/">← Dashboard</a></p>
```
In `src/app/log/page.tsx` delete (if present):
```tsx
      <p style={{ marginTop: 24 }}><a href="/">← Dashboard</a></p>
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/nav.tsx src/app/layout.tsx src/app/dashboard-client.tsx src/app/grid/page.tsx src/app/log/page.tsx
git commit -m "feat: add shared nav in root layout"
```

---

## Task 13: Matchups page

**Files:**
- Create: `src/app/matchups/page.tsx`

- [ ] **Step 1: Write `src/app/matchups/page.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { GameView, Recommendation } from "@/lib/types";

const ENTRY_NAMES = ["Jon", "Genevieve", "Elliot"];

interface EntryState { name: string; usedTeams: string[]; picksByWeek: Record<number, string> }

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function fmtOdds(o: number | null): string {
  if (o === null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}

export default function MatchupsPage() {
  const [weeks, setWeeks] = useState<number[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [games, setGames] = useState<GameView[]>([]);
  const [entry, setEntry] = useState(ENTRY_NAMES[0]);
  const [states, setStates] = useState<EntryState[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  const loadMatchups = useCallback(async (w: number | null) => {
    const url = w ? `/api/matchups?filter[week]=${w}` : "/api/matchups";
    const res = await fetch(url);
    const doc = await res.json();
    setGames(unwrapMany<GameView>(doc));
    setWeeks(doc.meta?.weeks ?? []);
    setWeek(doc.meta?.week ?? doc.meta?.currentWeek ?? null);
  }, []);

  const loadState = useCallback(async () => {
    const [s, r] = await Promise.all([fetch("/api/picks-state"), fetch("/api/recommendations")]);
    setStates(unwrapMany<EntryState>(await s.json()));
    setRecs(unwrapMany<Recommendation>(await r.json()));
  }, []);

  useEffect(() => { loadMatchups(null); loadState(); }, [loadMatchups, loadState]);

  const entryState = states.find((s) => s.name === entry);
  const used = new Set(entryState?.usedTeams ?? []);
  const weekPick = week !== null ? entryState?.picksByWeek?.[week] : undefined;
  const suggested = recs.find((r) => r.entry === entry && r.week === week)?.pick ?? null;

  async function pick(team: string) {
    if (week === null || used.has(team)) return;
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week, team, winProb: 0 } } }),
    });
    if (!res.ok) alert((await res.json()).errors?.[0]?.detail ?? "Pick failed");
    await loadState();
  }
  async function undo() {
    if (week === null) return;
    await fetch("/api/pick", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week } } }),
    });
    await loadState();
  }

  const byDay = new Map<string, GameView[]>();
  for (const g of games) {
    const d = fmtDay(g.kickoff);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(g);
  }

  function teamButton(team: string, prob: number, odds: number | null, source: string) {
    const isUsed = used.has(team);
    const isPick = weekPick === team;
    const isSuggested = suggested === team;
    return (
      <button
        onClick={() => pick(team)}
        disabled={isUsed}
        style={{
          display: "block", width: "100%", textAlign: "left", padding: 8, marginTop: 4,
          border: isPick ? "2px solid #0a0" : isSuggested ? "2px dashed #06c" : "1px solid #ccc",
          borderRadius: 6, background: isUsed ? "#f0f0f0" : "white",
          color: isUsed ? "#999" : "black", cursor: isUsed ? "not-allowed" : "pointer",
        }}
      >
        <strong>{team}</strong> {Math.round(prob * 100)}% · {fmtOdds(odds)}
        <span style={{ fontSize: 10, color: "#888" }}> {source}</span>
        {isPick && " ✓"}{isSuggested && !isPick && " ★"}
      </button>
    );
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Matchups</h1>
      <div style={{ marginBottom: 12 }}>
        {ENTRY_NAMES.map((n) => (
          <button key={n} onClick={() => setEntry(n)}
            style={{ marginRight: 8, fontWeight: entry === n ? 700 : 400 }}>{n}</button>
        ))}
        {weekPick && <span style={{ marginLeft: 16 }}>Week {week} pick: <strong>{weekPick}</strong>{" "}
          <button onClick={undo}>undo</button></span>}
      </div>
      <div style={{ marginBottom: 16, overflowX: "auto", whiteSpace: "nowrap" }}>
        {weeks.map((w) => (
          <button key={w} onClick={() => loadMatchups(w)}
            style={{ marginRight: 6, fontWeight: w === week ? 700 : 400 }}>W{w}</button>
        ))}
      </div>
      {[...byDay.entries()].map(([day, gs]) => (
        <section key={day} style={{ marginBottom: 20 }}>
          <h3>{day}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {gs.map((g) => (
              <div key={`${g.away}@${g.home}`} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#888" }}>{g.away} @ {g.home}</div>
                {teamButton(g.away, g.awayProb, g.awayOdds, g.source)}
                {teamButton(g.home, g.homeProb, g.homeOdds, g.source)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/matchups` listed.

- [ ] **Step 3: Commit**

```bash
git add src/app/matchups/page.tsx
git commit -m "feat: add matchups page with odds, suggestions, and pick/undo"
```

---

## Task 14: Calendar page

**Files:**
- Create: `src/app/calendar/page.tsx`

- [ ] **Step 1: Write `src/app/calendar/page.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { Matchup } from "@/lib/types";

const ENTRY_NAMES = ["", "Jon", "Genevieve", "Elliot"]; // "" = none
const TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

interface EntryState { name: string; usedTeams: string[] }

export default function CalendarPage() {
  const [games, setGames] = useState<Matchup[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((doc) => {
      setGames(unwrapMany<Matchup>(doc));
      setWeeks(doc.meta?.weeks ?? []);
    });
    fetch("/api/picks-state").then((r) => r.json()).then((doc) => setStates(unwrapMany<EntryState>(doc)));
  }, []);

  // cell[team][week] = { opp, home } or undefined (BYE)
  const cell = useMemo(() => {
    const m = new Map<string, Map<number, { opp: string; home: boolean }>>();
    for (const t of TEAMS) m.set(t, new Map());
    for (const g of games) {
      m.get(g.home)?.set(g.week, { opp: g.away, home: true });
      m.get(g.away)?.set(g.week, { opp: g.home, home: false });
    }
    return m;
  }, [games]);

  const used = new Set(states.find((s) => s.name === entry)?.usedTeams ?? []);

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Season Calendar</h1>
      <div style={{ marginBottom: 12 }}>
        Dim used teams for:{" "}
        <select value={entry} onChange={(e) => setEntry(e.target.value)}>
          {ENTRY_NAMES.map((n) => <option key={n} value={n}>{n || "— none —"}</option>)}
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr><th style={{ padding: 4 }}>Team</th>{weeks.map((w) => <th key={w} style={{ padding: 4 }}>W{w}</th>)}</tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => {
              const dim = used.has(t);
              return (
                <tr key={t} style={{ opacity: dim ? 0.35 : 1 }}>
                  <td style={{ fontWeight: 700, padding: 4 }}>{t}</td>
                  {weeks.map((w) => {
                    const c = cell.get(t)?.get(w);
                    return (
                      <td key={w} style={{
                        padding: 4, textAlign: "center", border: "1px solid #eee",
                        background: c ? (c.home ? "#e8f5e9" : "#f5f5f5") : "white",
                      }}>
                        {c ? (c.home ? c.opp : `@${c.opp}`) : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Green = home · grey = away · blank = BYE</p>
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/calendar` listed.

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/page.tsx
git commit -m "feat: add season calendar (team x week opponent grid)"
```

---

## Task 15: Full-suite gate + live smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass (existing + jsonapi + jsonapi-client + game-views).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; routes `/matchups`, `/calendar`, `/api/matchups`, `/api/schedule`, `/api/picks-state` present; `/api/pick` shows POST + DELETE.

- [ ] **Step 3: Live smoke test against the running dev server + Neon**

The dev server auto-loads `.env`. Start it if not running (`npm run dev`), ensure data is loaded
(`curl -X POST -b "sp_auth=071326" localhost:3000/api/refresh`), then:
```bash
# JSON:API content type + shape
curl -s -b "sp_auth=071326" localhost:3000/api/matchups | python3 -c "import sys,json;d=json.load(sys.stdin);print('games',len(d['data']),'| meta',d['meta'])" 
# record then undo a pick for Genevieve, confirm 201 then deleted:true
curl -s -o /dev/null -w "POST %{http_code}\n" -b "sp_auth=071326" -X POST -H "content-type: application/vnd.api+json" \
  -d '{"data":{"type":"pick","attributes":{"entry":"Genevieve","week":1,"team":"BUF","winProb":0.9}}}' localhost:3000/api/pick
curl -s -b "sp_auth=071326" -X DELETE -H "content-type: application/vnd.api+json" \
  -d '{"data":{"type":"pick","attributes":{"entry":"Genevieve","week":1}}}' localhost:3000/api/pick
```
Expected: matchups returns `data`/`meta`; POST → `201`; DELETE → `{"meta":{"deleted":true}}`.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: green suite + live JSON:API smoke for interface expansion" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** Matchups page (Tasks 10, 13), Calendar (Tasks 11, 14), undo/DELETE (Tasks 4, 8), JSON:API migration of all endpoints (Tasks 1, 5–11), `filter[week]`/`filter[entry]` + `safetyFloor` (Tasks 1, 5, 6, 10), shared Nav (Task 12), pure `buildGameViews` + `jsonapi` helpers tested (Tasks 1, 3), client envelope parsing (Tasks 2, 5–7, 13, 14). All spec sections covered.
- **Type consistency:** `resource/document/metaDocument/errorDocument/jsonApi/getFilter` defined in Task 1 and used unchanged in Tasks 5–11; `unwrapMany/unwrapOne` from Task 2 used in Tasks 5–7, 13, 14; `GameView` from Task 3 used in Tasks 10, 13; `removePick` from Task 4 used in Task 8; entry helpers `ENTRIES`/`NAME_TO_ID` from the existing `src/lib/entries.ts`.
- **Contract note:** `safetyFloor` is an implementation-specific query param (contains an uppercase letter, per JSON:API rules); `filter[week]`/`filter[entry]` use the reserved filter family.
