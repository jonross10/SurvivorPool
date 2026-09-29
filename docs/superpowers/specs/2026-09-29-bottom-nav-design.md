# Bottom Tab Bar Navigation — Design

**Date:** 2026-09-29
**Status:** Approved

## Goal

Replace the mobile navigation (top scrollable pills) with an app-like **bottom tab
bar**, while keeping the existing top pill nav on desktop. Based on variant C of
`public/nav-mockups.html`.

## Decisions

- **Scope:** Bottom tab bar on mobile (`< md`, 768px); keep current top scrollable
  pills on tablet/desktop (`>= md`).
- **Assistant:** Becomes a "Chat" tab in the bottom bar (routes to `/assistant`).
  Remove the floating 💬 `AssistantWidget` button + slide-over entirely.
- **Top bar:** Keep a slim brand bar (logo + "Survivor.") at the top on all sizes.
- **Out of scope:** The "W3" week badge shown in the mockup (needs data plumbing).

## Navigation model

Single shared `LINKS` array, each entry gains an inline-SVG `icon`:

| Route        | Label     | Icon        |
|--------------|-----------|-------------|
| `/`          | Dashboard / "Home" | house |
| `/matchups`  | Matchups  | split rect  |
| `/calendar`  | Calendar  | calendar    |
| `/plan`      | Plan      | list lines  |
| `/grid`      | Grid      | 4 squares   |
| `/assistant` | Chat      | speech bubble |

Bottom tab label uses short forms ("Home", "Chat"); desktop pills keep full labels.

## Components

### `src/app/nav.tsx`
Renders two structures from `LINKS`:
1. **Top bar** — `sticky top-0`, brand always visible. Pill row is `hidden md:flex`
   (desktop only), reusing existing `.pill` / `.pill-active`.
2. **Bottom tab bar** — `fixed bottom-0 inset-x-0`, `md:hidden`. Six tabs, icon over
   label, active tab colored `--accent`. Frosted `bg-surface/*` with top border.
   Includes `pb-[env(safe-area-inset-bottom)]` for the iPhone home indicator.

### `src/app/layout.tsx`
- Remove `<AssistantWidget />`.
- Wrap `{children}` so content gets `pb-20 md:pb-0` (clears the fixed bar on mobile).

### `src/app/globals.css`
Add `@layer components` classes `.tab` and `.tab-active` mirroring the mockup.

### Removal
Delete `src/components/AssistantWidget.tsx` (dead once the Chat tab replaces it).
`AssistantChat` is still used by `/assistant` page — keep it.

## Active-state logic (unchanged)
`isActive(href)` = exact match for `/`, else `path.startsWith(href)`.

## Testing / verification
- Run the app; verify at mobile width the bottom bar shows with 6 tabs, active tab
  highlighted, content not obscured, and desktop width shows the top pills.
- Confirm the floating 💬 button is gone and the Chat tab opens `/assistant`.
