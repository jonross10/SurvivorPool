# Merge Dashboard + Log (card + season timeline) — Design

**Date:** 2026-09-13
**Status:** Approved (pending spec review)
**Builds on:** the app on `feat/interface-expansion`.

## Goal

The Dashboard and Log are redundant (both per-entry card lists). Merge them: each Dashboard
entry card gains a read-only **season timeline** of that entry's picks (as prototyped in
mockup A). Remove the separate Log page, its route, and its nav item.

## Data

`/api/recommendations` already computes each entry's full `picksByWeek` internally (used today
only to derive `currentPick`). Expose it:

- Each `recommendation` resource's attributes gain **`picksByWeek: Record<number, string>`**
  (week → team) — the entry's complete pick history.
- The document `meta` gains **`weeks: number[]`** (the season's weeks, from the cached
  schedule) so the timeline renders the right columns.

No new endpoint; the Dashboard already fetches `/api/recommendations`.

## UI — Dashboard entry card (add the timeline)

Below the existing decision area (suggestion + reasoning + Confirm, or locked pick + Undo),
add a strip separated by a top border:

- A horizontally-scrollable row of week cells for every week in `meta.weeks`.
- Each cell: `W{n}` label; if a pick exists, the team logo + abbreviation; otherwise a muted
  dot. The **current week** cell is highlighted (emerald border/tint).
- **Read-only** — cells are not clickable (picks are made via the card's Confirm button or the
  Matchups/Grid pages).

Everything else on the Dashboard is unchanged (header add-entry + refresh controls, safety
floor, per-entry confirm/undo/delete).

## Removals

- Delete `src/app/log/page.tsx`.
- Delete `src/app/api/log/route.ts` (only the Log page used it).
- Remove the `Log` link from `src/app/nav.tsx` → nav becomes
  `Dashboard · Matchups · Calendar · Grid`.
- Delete the mockups `src/app/mock/a/page.tsx` and `src/app/mock/b/page.tsx`.

## Testing

- No new pure logic (the route change surfaces an already-computed value). Verify with
  `npx tsc --noEmit` + `npm run build`; existing suite stays green.
- Live: Dashboard shows each entry's timeline reflecting real picks (Jon W1 BUF, etc.), the
  current week highlighted; `Log` is gone from the nav; `/log` and `/api/log` return 404.

## Out of scope

- Clickable/editable past picks (read-only).
- Changing Matchups/Grid/Calendar.
