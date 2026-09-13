# User-Creatable Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pool entries DB-driven and let users create/delete them from the Dashboard.

**Architecture:** A pure `entries-util` (validation + name→id map) plus a cached `entries-repo` (`getEntries` via `unstable_cache`, `createEntry`/`deleteEntry` that `revalidateTag`). New `/api/entries` routes. Every consumer that imported the `ENTRIES` constant now reads entries from the DB (server) or `/api/entries` (client). Dashboard gains inline add/delete.

**Tech Stack:** Next.js 15 App Router, TypeScript, Vitest, `@neondatabase/serverless`, `next/cache`.

---

## File Structure

```
src/lib/
  types.ts                    # MODIFY: add Entry
  entries-util.ts             # NEW: validateEntryName, nameToId, error classes (pure)
  entries.ts                  # DELETE (constant removed)
  db/entries-repo.ts          # NEW: getEntries (cached), createEntry, deleteEntry
src/app/api/
  entries/route.ts            # NEW: GET (list), POST (create)
  entries/[id]/route.ts       # NEW: DELETE
  recommendations/route.ts    # MODIFY: getEntries/nameToId
  pick/route.ts               # MODIFY: nameToId(getEntries())
  grid/route.ts               # MODIFY: getEntries
  log/route.ts                # MODIFY: getEntries
  picks-state/route.ts        # MODIFY: getEntries
src/app/
  dashboard-client.tsx        # MODIFY: add/delete UI
  matchups/page.tsx           # MODIFY: fetch /api/entries
  calendar/page.tsx           # MODIFY: fetch /api/entries
  grid/page.tsx               # MODIFY: fetch /api/entries
```

---

## Task 1: Entry type + pure entries-util

**Files:** Modify `src/lib/types.ts`; create `src/lib/entries-util.ts`, `tests/lib/entries-util.test.ts`.

- [ ] **Step 1: Add `Entry` to `src/lib/types.ts`**

Append:
```ts
export interface Entry {
  id: string;
  name: string;
}
```

- [ ] **Step 2: Write the failing test `tests/lib/entries-util.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { validateEntryName, nameToId, EmptyNameError } from "@/lib/entries-util";

describe("validateEntryName", () => {
  it("trims and returns a valid name", () => {
    expect(validateEntryName("  Sarah  ")).toBe("Sarah");
  });
  it("throws EmptyNameError on blank input", () => {
    expect(() => validateEntryName("   ")).toThrow(EmptyNameError);
    expect(() => validateEntryName("")).toThrow(EmptyNameError);
  });
});

describe("nameToId", () => {
  it("maps entry names to ids", () => {
    const map = nameToId([{ id: "a1", name: "Jon" }, { id: "b2", name: "Sarah" }]);
    expect(map).toEqual({ Jon: "a1", Sarah: "b2" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/entries-util.test.ts`
Expected: FAIL — cannot find module `@/lib/entries-util`.

- [ ] **Step 4: Write `src/lib/entries-util.ts`**

```ts
import type { Entry } from "./types";

export class EmptyNameError extends Error {}
export class DuplicateNameError extends Error {}

/** Trim and validate an entry name. Throws EmptyNameError when blank. */
export function validateEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new EmptyNameError("Entry name is required");
  return trimmed;
}

/** Build a display-name → id lookup for the given entries. */
export function nameToId(entries: Entry[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.name, e.id]));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/entries-util.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/entries-util.ts tests/lib/entries-util.test.ts
git commit -m "feat: add Entry type and pure entries-util (validate, nameToId)"
```

---

## Task 2: entries-repo (cached read + create/delete)

**Files:** Create `src/lib/db/entries-repo.ts`.

- [ ] **Step 1: Write `src/lib/db/entries-repo.ts`**

```ts
import { unstable_cache, revalidateTag } from "next/cache";
import { sql } from "./client";
import { validateEntryName, DuplicateNameError } from "../entries-util";
import type { Entry } from "../types";

const TAG = "entries";

async function fetchEntries(): Promise<Entry[]> {
  return (await sql`SELECT id, name FROM entries ORDER BY name`) as unknown as Entry[];
}

/** Cached list of entries; invalidated by createEntry/deleteEntry via revalidateTag. */
export const getEntries = unstable_cache(fetchEntries, ["entries"], { tags: [TAG] });

export async function createEntry(name: string): Promise<Entry> {
  const clean = validateEntryName(name);
  const dup = (await sql`SELECT 1 FROM entries WHERE lower(name) = lower(${clean})`) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  const id = crypto.randomUUID();
  await sql`INSERT INTO entries (id, name) VALUES (${id}, ${clean})`;
  revalidateTag(TAG);
  return { id, name: clean };
}

export async function deleteEntry(id: string): Promise<boolean> {
  await sql`DELETE FROM picks WHERE entry_id = ${id}`;
  const rows = (await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`) as unknown[];
  revalidateTag(TAG);
  return rows.length > 0;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/entries-repo.ts
git commit -m "feat: add entries-repo with cached getEntries + create/delete"
```

---

## Task 3: /api/entries routes (GET, POST, DELETE)

**Files:** Create `src/app/api/entries/route.ts`, `src/app/api/entries/[id]/route.ts`.

- [ ] **Step 1: Write `src/app/api/entries/route.ts`**

```ts
import { getEntries, createEntry } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError } from "@/lib/entries-util";
import { resource, document, errorDocument, jsonApi } from "@/lib/jsonapi";

export async function GET() {
  const entries = await getEntries();
  const data = entries.map((e) => resource("entry", e.id, { name: e.name }));
  return jsonApi(document(data));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name: string = body?.data?.attributes?.name ?? "";
  try {
    const e = await createEntry(name);
    return jsonApi(document(resource("entry", e.id, { name: e.name })), 201);
  } catch (err) {
    if (err instanceof EmptyNameError) {
      return jsonApi(errorDocument([{ status: "400", title: "Invalid name", detail: err.message }]), 400);
    }
    if (err instanceof DuplicateNameError) {
      return jsonApi(errorDocument([{ status: "409", title: "Duplicate entry", detail: err.message }]), 409);
    }
    throw err;
  }
}
```

- [ ] **Step 2: Write `src/app/api/entries/[id]/route.ts`**

```ts
import { deleteEntry } from "@/lib/db/entries-repo";
import { metaDocument, jsonApi } from "@/lib/jsonapi";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; `/api/entries` (GET, POST) and `/api/entries/[id]` (DELETE) in the route table.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/entries
git commit -m "feat: add /api/entries routes (list, create, delete)"
```

---

## Task 4: Refactor server routes off the constant

**Files:** Modify `src/app/api/recommendations/route.ts`, `pick/route.ts`, `grid/route.ts`, `log/route.ts`, `picks-state/route.ts`; delete `src/lib/entries.ts`.

- [ ] **Step 1: `recommendations/route.ts`** — replace the `entries` import + usage

Change the import line `import { ENTRIES, NAME_TO_ID } from "@/lib/entries";` to:
```ts
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
```
Replace the `usedByEntry`/`picksByWeekByEntry` build loop's `ENTRIES` with a fetched list and use `nameToId` for the resource id:
```ts
  const entries = await getEntries();
  const idByName = nameToId(entries);

  const usedByEntry: Record<string, Set<TeamAbbr>> = {};
  const picksByWeekByEntry: Record<string, Record<number, string>> = {};
  for (const e of entries) {
    const picks = await getPicks(e.id);
    usedByEntry[e.name] = new Set(picks.map((p) => p.team));
    picksByWeekByEntry[e.name] = Object.fromEntries(picks.map((p) => [p.week, p.team]));
  }

  const recs = buildRecommendations(schedule, strengths, odds, usedByEntry, new Date(), safetyFloor);
  const week = recs[0]?.week ?? null;
  const data = recs.map((r) =>
    resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      currentPick: week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null,
    }),
  );
```

- [ ] **Step 2: `pick/route.ts`** — build the map from the DB

Change `import { NAME_TO_ID } from "@/lib/entries";` to:
```ts
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
```
Inside both `POST` and `DELETE`, replace `const entryId = entry ? NAME_TO_ID[entry] : undefined;` with:
```ts
    const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
```

- [ ] **Step 3: `grid/route.ts`** — fetch entries; default to first

Change `import { NAME_TO_ID, ENTRIES } from "@/lib/entries";` to:
```ts
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
```
Replace the entry resolution:
```ts
  const entries = await getEntries();
  if (entries.length === 0) return jsonApi(document([], { week: 0, entry: null }));
  const entry = getFilter(req, "entry") ?? entries[0].name;
  const entryId = nameToId(entries)[entry] ?? entries[0].id;
  ...
  const used = await getUsedTeams(entryId);
```
(Keep the rest; `document(data, { week, entry })` unchanged.)

- [ ] **Step 4: `log/route.ts`** — loop over fetched entries

Change `import { ENTRIES } from "@/lib/entries";` to `import { getEntries } from "@/lib/db/entries-repo";` and:
```ts
export async function GET() {
  const data = [];
  for (const e of await getEntries()) {
    const picks = await getPicks(e.id);
    for (const p of picks) {
      data.push(resource("pick", `${e.id}:${p.week}`, { entry: e.name, week: p.week, team: p.team }));
    }
  }
  return jsonApi(document(data));
}
```

- [ ] **Step 5: `picks-state/route.ts`** — loop over fetched entries

Change `import { ENTRIES } from "@/lib/entries";` to `import { getEntries } from "@/lib/db/entries-repo";` and change `for (const e of ENTRIES)` to `for (const e of await getEntries())`.

- [ ] **Step 6: Delete the constant**

Run: `git rm src/lib/entries.ts`

- [ ] **Step 7: Verify build (no remaining imports of the deleted file)**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. If tsc reports `Cannot find module "@/lib/entries"` anywhere, that file still imports the constant — fix it to use `getEntries`/`nameToId`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: read entries from the DB in all server routes; drop the constant"
```

---

## Task 5: Refactor client pages to fetch /api/entries

**Files:** Modify `src/app/matchups/page.tsx`, `src/app/calendar/page.tsx`, `src/app/grid/page.tsx`.

Shared pattern — replace the hardcoded name list with state fetched once on mount:
```tsx
const [entryNames, setEntryNames] = useState<string[]>([]);
useEffect(() => {
  fetch("/api/entries").then((r) => r.json())
    .then((doc) => setEntryNames((doc.data ?? []).map((e: { attributes: { name: string } }) => e.attributes.name)));
}, []);
```

- [ ] **Step 1: `matchups/page.tsx`**

Remove `const ENTRY_NAMES = ["Jon", "Genevieve", "Elliot"];`. Add the `entryNames` state + fetch above. Initialize the active entry once names load:
```tsx
const [entry, setEntry] = useState("");
useEffect(() => { if (!entry && entryNames.length) setEntry(entryNames[0]); }, [entryNames, entry]);
```
Change the entry-tab render `ENTRY_NAMES.map(...)` → `entryNames.map(...)`.

- [ ] **Step 2: `calendar/page.tsx`**

Remove `const ENTRY_NAMES = ["", "Jon", "Genevieve", "Elliot"];`. Add the `entryNames` fetch. Build the select options from `["", ...entryNames]`:
```tsx
{["", ...entryNames].map((n) => <option key={n} value={n}>{n || "— none —"}</option>)}
```

- [ ] **Step 3: `grid/page.tsx`**

Remove `import { ENTRY_NAMES } from "@/lib/entries";`. Add the `entryNames` fetch state. Initialize `entry` from the first name once loaded:
```tsx
const [entry, setEntry] = useState("");
useEffect(() => { if (!entry && entryNames.length) setEntry(entryNames[0]); }, [entryNames, entry]);
```
Guard the grid fetch so it only runs with an entry: wrap the existing `load` effect body in `if (!entry) return;`. Change the `<select>` options to `entryNames.map(...)`.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; no references to `@/lib/entries` remain.

- [ ] **Step 5: Commit**

```bash
git add src/app/matchups/page.tsx src/app/calendar/page.tsx src/app/grid/page.tsx
git commit -m "refactor: client pages fetch entries from /api/entries"
```

---

## Task 6: Dashboard add/delete UI

**Files:** Modify `src/app/dashboard-client.tsx`.

- [ ] **Step 1: Add create/delete handlers**

After the existing `refreshStats` function, add:
```tsx
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function addEntry() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "entry", attributes: { name } } }),
    });
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Could not add entry");
      return;
    }
    setNewName("");
    setAdding(false);
    load();
  }

  async function removeEntry(r: Rec) {
    if (!confirm(`Delete ${r.entry} and all their picks?`)) return;
    // The recommendation id is the entry id.
    const id = (r as unknown as { id?: string }).id;
    await fetch(`/api/entries/${id ?? ""}`, { method: "DELETE" });
    load();
  }
```

**Note:** the recommendation resource `id` is the entry id, but `unwrapMany` drops it. Add an
`entryId` to each rec by parsing the raw doc. Replace the `load()` body's `setRecs(...)` line:
```tsx
    const doc = await res.json();
    const recsWithId: Rec[] = (doc.data ?? []).map(
      (d: { id: string; attributes: Rec }) => ({ ...d.attributes, entryId: d.id }),
    );
    setRecs(recsWithId);
```
and extend the type: `type Rec = Recommendation & { currentPick?: string | null; entryId?: string };`
Then in `removeEntry`, use `r.entryId` instead of the cast:
```tsx
    await fetch(`/api/entries/${r.entryId ?? ""}`, { method: "DELETE" });
```

- [ ] **Step 2: Add the "+ Add entry" control by the header**

In the header's right-hand `<div className="flex items-center gap-2">` (next to Refresh stats), add before the refresh button:
```tsx
          {adding ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
                placeholder="Name"
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <button onClick={addEntry} className="rounded-lg bg-emerald-600 px-2 py-1 text-sm font-medium text-white hover:bg-emerald-700">Add</button>
              <button onClick={() => { setAdding(false); setNewName(""); }} className="px-1 text-sm text-slate-500">✕</button>
            </span>
          ) : (
            <button onClick={() => setAdding(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Add entry</button>
          )}
```

- [ ] **Step 3: Add a delete "×" to each entry card header**

Replace the card's `<h2 className="text-lg font-bold">{r.entry}</h2>` with a header row:
```tsx
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{r.entry}</h2>
              <button
                onClick={() => removeEntry(r)}
                title="Delete entry"
                className="text-slate-300 transition-colors hover:text-red-500"
              >
                ✕
              </button>
            </div>
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-client.tsx
git commit -m "feat: add inline add/delete entry UI on the dashboard"
```

---

## Task 7: Final gate + live verification

- [ ] **Step 1:** `npm test` — all pass (existing + entries-util).
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` — clean; `/api/entries` + `/api/entries/[id]` present; no `@/lib/entries` references remain (`grep -r "@/lib/entries\"" src` returns nothing; `@/lib/entries-util` is fine).
- [ ] **Step 3: Live test against the running dev server + Neon:**
```bash
# create
curl -s -b "sp_auth=071326" -X POST -H "content-type: application/vnd.api+json" \
  -d '{"data":{"type":"entry","attributes":{"name":"Testy"}}}' localhost:3000/api/entries
# duplicate → 409
curl -s -o /dev/null -w "dup %{http_code}\n" -b "sp_auth=071326" -X POST -H "content-type: application/vnd.api+json" \
  -d '{"data":{"type":"entry","attributes":{"name":"testy"}}}' localhost:3000/api/entries
# list shows it
curl -s -b "sp_auth=071326" localhost:3000/api/entries | python3 -c "import sys,json;print([e['attributes']['name'] for e in json.load(sys.stdin)['data']])"
# delete it (grab its id from the list first), then confirm recommendations still returns the 3 originals
```
Expected: create `201`; duplicate `409`; list includes "Testy"; after delete, it's gone and recommendations returns the original entries.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "test: green suite + live verification for user-creatable entries" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** DB-driven getEntries + cache (Task 2); createEntry dup/empty + deleteEntry-with-picks (Task 2); `/api/entries` GET/POST/DELETE (Task 3); server consumers refactored + constant deleted (Task 4); client pages fetch entries (Task 5); Dashboard add/delete inline (Task 6); tests + live verify (Tasks 1, 7). All spec sections covered.
- **Type consistency:** `Entry {id,name}` (Task 1) used by `entries-util` (1), `entries-repo` (2), routes (3–5). `validateEntryName`/`nameToId`/`EmptyNameError`/`DuplicateNameError` defined in `entries-util` (Task 1) and consumed in `entries-repo` (2) + routes (3). `getEntries`/`createEntry`/`deleteEntry` (Task 2) consumed in routes (3–4). Rec gains `entryId` (Task 6) sourced from the resource `id`.
- **Cache correctness:** `getEntries` is `unstable_cache`-wrapped with tag `entries`; `createEntry`/`deleteEntry` call `revalidateTag("entries")`, so writes bust the read cache.
