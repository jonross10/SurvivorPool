# UI Restyle (Tailwind) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app as a clean, light-theme sportsbook UI with Tailwind, team logos, and colored win-% pills — no behavior changes.

**Architecture:** Add Tailwind + a light design-token theme; add a tested `team-visuals` helper (logo URL + color) and three shared presentational components (`TeamLogo`, `WinProbPill`, `TeamRow`); restyle each page/nav to shared conventions.

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, TypeScript, Vitest.

---

## Shared styling conventions (apply everywhere)

- **Page shell:** `min-h-screen bg-slate-50 text-slate-900`; content wrapper `mx-auto max-w-5xl px-4 py-6` (wider for grid/calendar).
- **Card:** `rounded-xl border border-slate-200 bg-white shadow-sm p-4`.
- **Heading:** `text-2xl font-bold tracking-tight`; secondary text `text-slate-500`.
- **Accent:** emerald — primary buttons `bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40`.
- **Pill tab (active):** `bg-slate-900 text-white`; inactive `bg-white text-slate-600 border border-slate-200`; both `rounded-full px-3 py-1 text-sm`.
- **Transitions:** add `transition-colors` on interactive elements.

---

## Task 1: Tailwind setup + light theme + font

**Files:** create `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`; modify `src/app/layout.tsx`, `package.json`.

- [ ] **Step 1: Install Tailwind**

Run:
```bash
cd /Users/jonross/SurvivorPool
npm install -D tailwindcss@3 postcss autoprefixer
```

- [ ] **Step 2: `postcss.config.mjs`**

```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

- [ ] **Step 3: `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { @apply bg-slate-50 text-slate-900; }
```

- [ ] **Step 5: Import font + globals in `src/app/layout.tsx`**

```tsx
import "./globals.css";
import { Inter } from "next/font/google";
import Nav from "./nav";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds; Tailwind compiles (no PostCSS errors).

- [ ] **Step 7: Commit**

```bash
git add postcss.config.mjs tailwind.config.ts src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "chore: set up Tailwind CSS with light theme and Inter font"
```

---

## Task 2: team-visuals helper (logos + colors)

**Files:** create `src/lib/team-visuals.ts`, `tests/lib/team-visuals.test.ts`.

- [ ] **Step 1: Write the failing test `tests/lib/team-visuals.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { espnLogoAbbr, teamLogoUrl, teamColor } from "@/lib/team-visuals";
import { TEAMS } from "@/lib/teams";

describe("team-visuals", () => {
  it("maps our abbreviations to ESPN logo slugs", () => {
    expect(espnLogoAbbr("JAC")).toBe("jax");
    expect(espnLogoAbbr("WAS")).toBe("wsh");
    expect(espnLogoAbbr("BUF")).toBe("buf");
  });
  it("builds a well-formed CDN URL", () => {
    expect(teamLogoUrl("KC")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/kc.png");
  });
  it("returns a hex color for every one of the 32 teams", () => {
    for (const t of TEAMS) {
      expect(teamColor(t)).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(espnLogoAbbr(t)).toMatch(/^[a-z]{2,3}$/);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/team-visuals.test.ts`
Expected: FAIL — cannot find module `@/lib/team-visuals`.

- [ ] **Step 3: Write `src/lib/team-visuals.ts`**

```ts
import type { TeamAbbr } from "./types";

// Our canonical abbr → ESPN logo slug (mostly identity lowercased).
const ESPN_SLUG: Record<string, string> = { JAC: "jax", WAS: "wsh" };

export function espnLogoAbbr(abbr: TeamAbbr): string {
  return ESPN_SLUG[abbr] ?? abbr.toLowerCase();
}

export function teamLogoUrl(abbr: TeamAbbr): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnLogoAbbr(abbr)}.png`;
}

const COLORS: Record<string, string> = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D", CAR: "#0085CA",
  CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00", DAL: "#041E42", DEN: "#FB4F14",
  DET: "#0076B6", GB: "#203731", HOU: "#03202F", IND: "#002C5F", JAC: "#101820",
  KC: "#E31837", LV: "#000000", LAC: "#0080C6", LAR: "#003594", MIA: "#008E97",
  MIN: "#4F2683", NE: "#002244", NO: "#D3BC8D", NYG: "#0B2265", NYJ: "#125740",
  PHI: "#004C54", PIT: "#FFB612", SF: "#AA0000", SEA: "#002244", TB: "#D50A0A",
  TEN: "#0C2340", WAS: "#5A1414",
};

export function teamColor(abbr: TeamAbbr): string {
  return COLORS[abbr] ?? "#334155"; // slate-700 fallback
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/team-visuals.test.ts`
Expected: PASS (3 tests, incl. the 32-team loop).

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-visuals.ts tests/lib/team-visuals.test.ts
git commit -m "feat: add team-visuals (logo URLs + team colors)"
```

---

## Task 3: Shared presentational components

**Files:** create `src/components/TeamLogo.tsx`, `src/components/WinProbPill.tsx`, `src/components/TeamRow.tsx`.

- [ ] **Step 1: `src/components/TeamLogo.tsx`**

Uses a plain `<img>` (avoids `next/image` remote-domain config) with abbr fallback on error.
```tsx
"use client";
import { useState } from "react";
import { teamLogoUrl } from "@/lib/team-visuals";

export default function TeamLogo({ abbr, size = 28 }: { abbr: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600"
      >
        {abbr}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoUrl(abbr)}
      alt={abbr}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="inline-block object-contain"
    />
  );
}
```

- [ ] **Step 2: `src/components/WinProbPill.tsx`**

```tsx
export default function WinProbPill({ prob }: { prob: number }) {
  const hue = Math.round(prob * 120); // 0=red → 120=green
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900"
      style={{ background: `hsl(${hue}, 75%, 85%)` }}
    >
      {Math.round(prob * 100)}%
    </span>
  );
}
```

- [ ] **Step 3: `src/components/TeamRow.tsx`**

```tsx
import TeamLogo from "./TeamLogo";

export default function TeamRow({ abbr, size = 24 }: { abbr: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <TeamLogo abbr={abbr} size={size} />
      <span className="font-semibold">{abbr}</span>
    </span>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: add TeamLogo, WinProbPill, TeamRow components"
```

---

## Task 4: Restyle Nav

**Files:** modify `src/app/nav.tsx`.

- [ ] **Step 1: Rewrite `src/app/nav.tsx`** as a sticky bar with active-link highlight

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/matchups", label: "Matchups" },
  { href: "/calendar", label: "Calendar" },
  { href: "/grid", label: "Grid" },
  { href: "/log", label: "Log" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
        <span className="mr-4 font-bold tracking-tight">🏈 Survivor</span>
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/nav.tsx
git commit -m "feat: restyle nav as sticky bar with active state"
```

---

## Task 5: Restyle Dashboard

**Files:** modify `src/app/dashboard-client.tsx`.

Keep ALL existing logic/state/handlers (`recs`, `floor`, `load`, `confirm`, `undo`, the
`currentPick` locked/suggested branching). Only replace the returned JSX with Tailwind markup,
using `TeamLogo`, `WinProbPill`, and the shared card/button conventions:
- Page shell wrapper `mx-auto max-w-4xl px-4 py-6`.
- `<h1 className="text-2xl font-bold tracking-tight">Survivor Pool — Week {…}</h1>`.
- Safety-floor row: label + range input, `text-sm text-slate-500`.
- Cards grid: `grid grid-cols-1 gap-4 sm:grid-cols-2 mt-4`; each entry a card
  (`rounded-xl border border-slate-200 bg-white shadow-sm p-4`).
- Card header: entry name `text-lg font-bold`.
- Locked (`r.currentPick`): `TeamLogo size=40` + team + a green badge
  `rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold` reading
  "✓ picked"; subtext "Locked in for Week {r.week}"; an Undo button
  (`text-sm text-slate-500 underline`).
- Suggested: small `text-xs uppercase tracking-wide text-slate-400`("Suggested") + `TeamLogo`
  + team + `<WinProbPill prob={r.prob} />`; reasoning `text-slate-600 text-sm`; greedy alt
  `text-xs text-slate-400`; primary Confirm button (emerald convention).

- [ ] **Step 1:** Rewrite the JSX per above; leave the hooks/handlers untouched.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3:** Commit: `git add src/app/dashboard-client.tsx && git commit -m "feat: restyle dashboard with Tailwind, logos, and win-% pills"`

---

## Task 6: Restyle Matchups

**Files:** modify `src/app/matchups/page.tsx`.

Keep ALL logic (week/entry state, `loadMatchups`, `loadState`, `pick`, `undo`, `byDay`
sorting, `used`/`weekPick`/`suggested` derivations). Replace JSX + the `teamButton` styling:
- Wrapper `mx-auto max-w-5xl px-4 py-6`; `<h1>` heading convention.
- Entry tabs + week tabs: pill-tab convention (active `bg-slate-900 text-white`). Week tabs in
  a `flex gap-2 overflow-x-auto pb-2`.
- The current pick banner: if `weekPick`, a card row with `TeamLogo` + "Week {week} pick" +
  Undo button.
- Day sections: `<h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">`.
- Game grid: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`; each game a card with a header
  `text-xs text-slate-400` ("AWAY @ HOME"), then two pick buttons.
- `teamButton` becomes a full-width button: `flex items-center justify-between rounded-lg
  border px-3 py-2 transition-colors`; state classes:
  - used → `border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed`
  - picked → `border-emerald-500 bg-emerald-50`
  - suggested → `border-blue-400 border-dashed`
  - default → `border-slate-200 hover:bg-slate-50`
  Left side: `<TeamRow abbr>`; right side: `<WinProbPill prob>` + odds `text-xs text-slate-400`
  + a `✓`/`★` marker as today.

- [ ] **Step 1:** Rewrite JSX + `teamButton` per above; keep handlers/derivations.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3:** Commit: `git add src/app/matchups/page.tsx && git commit -m "feat: restyle matchups with logos, pill tabs, and styled pick states"`

---

## Task 7: Restyle Grid + Calendar

**Files:** modify `src/app/grid/page.tsx`, `src/app/calendar/page.tsx`.

Keep all logic. Tailwind-polish the tables:
- Wrapper `mx-auto max-w-none px-4 py-6`; heading convention; entry `<select>` styled
  `rounded-lg border border-slate-200 px-2 py-1 text-sm`.
- Table: `border-separate border-spacing-0 text-sm`; sticky first column
  (`sticky left-0 bg-white`) and header row (`sticky top-0`); cells `px-2 py-1 text-center`.
- **Grid** cells keep the `hsl` heat background (inline style) but add `rounded`/border via
  classes; team column shows `<TeamRow abbr size={20}/>`.
- **Calendar** first column shows `<TeamRow abbr size={20}/>`; opponent cells: home
  `bg-emerald-50`, away `bg-slate-50 text-slate-500` (prefix `@`), BYE blank; keep the
  used-entry row dimming (`opacity-40`). Legend line `text-xs text-slate-400`.

- [ ] **Step 1:** Restyle both files per above; keep logic.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3:** Commit: `git add src/app/grid/page.tsx src/app/calendar/page.tsx && git commit -m "feat: restyle grid and calendar tables with Tailwind + logos"`

---

## Task 8: Restyle Log

**Files:** modify `src/app/log/page.tsx`.

Keep the fetch/group logic. JSX: wrapper + heading convention; `grid gap-4 sm:grid-cols-3`;
each entry a card; picks as a list of rows, each `flex items-center gap-2` with
`text-xs text-slate-400` week label + `<TeamRow abbr size={20}/>`.

- [ ] **Step 1:** Restyle JSX; keep logic.
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` → clean.
- [ ] **Step 3:** Commit: `git add src/app/log/page.tsx && git commit -m "feat: restyle pick log with cards and logos"`

---

## Task 9: Final gate + live visual check

- [ ] **Step 1:** `npm test` — all pass (existing + team-visuals).
- [ ] **Step 2:** `npx tsc --noEmit && npm run build` — clean.
- [ ] **Step 3:** With the dev server running, load `/`, `/matchups`, `/calendar`, `/grid`,
  `/log` (via `?pw=071326`) and confirm: logos render (and the abbr fallback works for any
  that 404), win-% pills are colored, nav active state works, no layout breakage. Note any
  visual fix and apply it.
- [ ] **Step 4:** Commit any fixes: `git add -A && git commit -m "polish: visual fixes from live review" || echo "nothing to commit"`

---

## Self-Review Notes

- **Spec coverage:** Tailwind + light theme + font (Task 1); `team-visuals` tested (Task 2);
  `TeamLogo`/`WinProbPill`/`TeamRow` (Task 3); nav (4), dashboard (5), matchups (6),
  grid+calendar (7), log (8); final gate (9). All spec sections covered.
- **No behavior changes:** Tasks 5–8 explicitly preserve existing hooks/handlers/derivations
  and only change JSX/classes.
- **Type consistency:** `espnLogoAbbr`/`teamLogoUrl`/`teamColor` (Task 2) consumed by
  `TeamLogo`/components (Task 3) and pages (5–8); component prop names (`abbr`, `size`,
  `prob`) stable across usages.
