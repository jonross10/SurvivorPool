# UI Restyle (Tailwind, light theme) — Design

**Date:** 2026-09-13
**Status:** Approved (pending spec review)
**Builds on:** the functionally-complete app on `feat/interface-expansion`. No behavior changes —
purely visual, plus small tested helper modules for team visuals.

## Goal

Make the UI look like a clean, modern sportsbook (à la the Splash Sports UI): card-based,
good typography and spacing, subtle shadows, team logos, colored win-% pills, team-color
accents. Light theme.

## Stack

- **Tailwind CSS** (first-class Next.js 15 App Router support): `tailwindcss`, `postcss`,
  `autoprefixer`; `tailwind.config.ts`; `src/app/globals.css` with `@tailwind` directives,
  imported in `layout.tsx`.
- **Design tokens** (Tailwind theme extend + a few CSS vars): app bg `slate-50`; surfaces
  white with `slate-200` border + `shadow-sm`; `rounded-xl`; accent = `emerald-600`; text
  `slate-900` / secondary `slate-500`; one clean font (system stack or a single Google font
  via `next/font`).

## New pure modules (unit-tested)

`src/lib/team-visuals.ts`:
- `espnLogoAbbr(abbr): string` — maps our canonical abbr to ESPN's logo slug (identity
  lowercased for most; `JAC→jax`, `WAS→wsh`). Logo URL =
  `https://a.espncdn.com/i/teamlogos/nfl/500/{slug}.png`.
- `teamLogoUrl(abbr): string` — the full CDN URL.
- `teamColor(abbr): string` — primary hex per team (32-entry map).
- Tests: every one of the 32 `TEAMS` produces a non-empty slug, a well-formed URL, and a
  hex color; no throws.

## Shared components (`src/components/`)

- `TeamLogo.tsx` — `<TeamLogo abbr size />`: `next/image` (or `<img>`) from the CDN with
  `alt={abbr}`; on error, falls back to the abbreviation text so a missing logo never breaks
  layout.
- `WinProbPill.tsx` — `<WinProbPill prob />`: rounded pill, background color scaled
  red→amber→green by probability, shows the rounded %.
- `TeamRow.tsx` — logo + abbreviation inline, reused across matchup/dashboard/log.

## Per-page polish (structure/behavior unchanged)

- **Nav** (`nav.tsx`) — sticky top bar, app name, links with an active-route highlight.
- **Dashboard** (`dashboard-client.tsx`) — entry cards with a header (name + initial avatar);
  locked pick → team logo + green "✓ picked" badge + Undo; suggested → logo + `WinProbPill`
  + reasoning + greedy alt + Confirm; the safety-floor slider styled and labeled.
- **Matchups** (`matchups/page.tsx`) — entry tabs as pill buttons; week tabs as a scrollable
  pill row with an active state; day sections with clear headers; game cards showing both
  teams (`TeamRow` + `WinProbPill` + odds) as pick buttons with distinct
  selected / suggested / used styles.
- **Grid** (`grid/page.tsx`) — same heat-mapped table, Tailwind-polished cells + header.
- **Calendar** (`calendar/page.tsx`) — team rows with `TeamLogo`; cleaner grid, legend.
- **Log** (`log/page.tsx`) — per-entry cards with logos.

## Testing

- `team-visuals.test.ts` — slug/URL/color for all 32 teams; `JAC→jax`, `WAS→wsh` mappings.
- Existing suite stays green; `npx tsc --noEmit` + `npm run build` clean.
- Visual result verified live via the running dev server (Fast Refresh).

## Out of scope

- Dark mode / theme toggle.
- Animations beyond subtle hover/focus transitions.
- Redesigning data flow, endpoints, or page structure.
