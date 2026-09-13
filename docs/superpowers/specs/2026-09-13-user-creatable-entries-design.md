# User-Creatable Entries — Design

**Date:** 2026-09-13
**Status:** Approved (pending spec review)
**Builds on:** the app on `feat/interface-expansion`. Entries are currently a compile-time
constant (`src/lib/entries.ts`) imported across ~9 files; this makes them DB-driven and
adds create/delete via the UI.

## Goal

Let a user add and delete pool entries from the Dashboard. Entries become dynamic (read from
the `entries` table) instead of hardcoded.

## Data Layer — `src/lib/db/entries-repo.ts` (new)

The `entries` table already exists: `id TEXT PRIMARY KEY, name TEXT NOT NULL`. `picks.entry_id`
references it (no `ON DELETE CASCADE`), so deletes must remove picks first.

- **`getEntries(): Promise<Entry[]>`** — `SELECT id, name FROM entries ORDER BY name`.
  Wrapped in Next's `unstable_cache` with tag `"entries"` so repeated reads across requests
  are served from cache rather than Postgres.
- **`createEntry(name: string): Promise<Entry>`** — trims the name; throws `EmptyNameError`
  if blank; throws `DuplicateNameError` if a **case-insensitive** match already exists (names
  must be unique — the app keys picks by name); generates an internal id
  (`crypto.randomUUID()`); inserts; calls `revalidateTag("entries")`.
- **`deleteEntry(id: string): Promise<boolean>`** — `DELETE FROM picks WHERE entry_id = id`
  then `DELETE FROM entries WHERE id = id RETURNING id`; calls `revalidateTag("entries")`;
  returns whether a row was removed.
- `Entry` type (`{ id: string; name: string }`) moves to `src/lib/types.ts`.

**Caching:** `getEntries` uses `unstable_cache(fn, ["entries"], { tags: ["entries"] })`;
writes call `revalidateTag("entries")`. Correct-by-construction: any create/delete busts the
cache immediately. (Data is tiny, so this is cleanliness more than performance.)

## API (JSON:API)

- **`GET /api/entries`** → `entry` resources `{ type:"entry", id, attributes:{ name } }`.
- **`POST /api/entries`** → body `{ data:{ type:"entry", attributes:{ name } } }`; `201` with
  the created `entry`; `400` on empty name; `409` on duplicate name (with a clear `detail`).
- **`DELETE /api/entries/[id]`** → deletes the entry + its picks; `200`
  `metaDocument({ deleted })`.

## Refactor: replace the constant with DB/API reads

Delete `src/lib/entries.ts`. Update consumers:

- **Server routes** (`recommendations`, `pick`, `grid`, `log`, `picks-state`): call
  `getEntries()` and build the name→id map locally where needed (a small
  `nameToId(entries)` helper in `entries-repo.ts`, unit-tested).
- **Client pages** (`matchups`, `calendar`, `grid`): fetch `GET /api/entries` on mount for
  the entry list (they currently use the hardcoded names). Calendar's "dim used teams for"
  select becomes `["", ...entryNames]`.
- **Dashboard**: already receives all entries via `/api/recommendations` (one rec per entry);
  it additionally owns the add/delete UI and re-fetches after a change.

## UI — Dashboard (inline)

- **Add:** an "+ Add entry" control by the header. Clicking reveals a small text input +
  Save; submitting `POST`s the name, then reloads recommendations + freshness. Duplicate/empty
  errors surface inline.
- **Delete:** each entry card gets a small "×" in its header; clicking asks
  `confirm("Delete {name} and all their picks?")`, then `DELETE`s and reloads.

## Testing

- `entries-repo.test.ts` — pure bits: `nameToId(entries)` mapping; name trimming/empty
  validation logic (extracted as a pure `validateEntryName`).
- DB behavior (create, case-insensitive dup rejection, delete-with-picks, cache
  invalidation) verified live against Neon.
- Existing suite stays green; `tsc` + `next build` clean; new-entry flow verified in the
  running app.

## Edge cases

- Deleting all entries → empty dashboard/grids (acceptable empty state; no "must keep one"
  rule).
- A newly created entry has no picks → appears everywhere with suggestions and an empty grid
  row set (same as an unpicked existing entry).

## Out of scope

- Rename (delete + re-add), reordering, per-entry auth, client-side cross-page entry cache.
