# Multi-User Auth (Better Auth + Google) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure multi-user login (Google now, Apple later) so each user tracks only their own entries, with the Klaviyo agent writing on behalf of a specific user.

**Architecture:** Better Auth runs in-app and stores users/sessions in the existing Neon Postgres (via a `@neondatabase/serverless` `Pool`). Every entry gets a required `owner_id` FK to the Better Auth `user` table; all entry/pick reads and writes are scoped to the session user. The Klaviyo agent authenticates with the existing `AGENT_WRITE_TOKEN` service credential **plus** an on-behalf-of user id.

**Tech Stack:** Next.js 15 (App Router), React 19, Neon Postgres, Better Auth, `ulid`, Vitest.

**Design doc:** `docs/superpowers/specs/2026-09-29-auth-multiuser-research.md` (decisions in §0).

**Phasing:** Phase 1 delivers working Google login (app gated, entries still global). Phase 2 makes entries per-owner. Phase 3 scopes the agent. Each phase ends green and committed.

---

## Phase 1 — Better Auth + Google login

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

Run: `npm install better-auth ulid`
Expected: `better-auth` and `ulid` added to `dependencies`.

- [ ] **Step 2: Verify install**

Run: `node -e "require('better-auth'); require('ulid'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-auth and ulid deps"
```

### Task 2: Better Auth server instance

**Files:**
- Create: `src/lib/auth.ts`

Better Auth needs a node-postgres-style `Pool`. `@neondatabase/serverless` exports a
WebSocket `Pool` that is drop-in compatible, so we reuse our single DB driver and the
existing `resolveDatabaseUrl()` helper.

- [ ] **Step 1: Create the server auth instance**

```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";
import { resolveDatabaseUrl } from "./db/client";

// Better Auth accepts a node-postgres-compatible Pool; Neon's serverless Pool works.
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: new Pool({ connectionString: resolveDatabaseUrl() }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  // Apple added later — see Phase 4 placeholder task. Keep this object shape.
});

export type Session = typeof auth.$Infer.Session;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (env vars may be undefined at build; that's fine — they're read at runtime).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): add Better Auth server instance with Google provider"
```

### Task 3: Mount the Next.js auth route handler

**Files:**
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Create the catch-all handler**

```ts
// src/app/api/auth/[...all]/route.ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(auth);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/auth
git commit -m "feat(auth): mount Better Auth Next.js route handler"
```

### Task 4: Client auth helper

**Files:**
- Create: `src/lib/auth-client.ts`

- [ ] **Step 1: Create the client**

```ts
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

// baseURL defaults to the current origin in the browser; leave unset so it works
// across localhost, Vercel previews, and production without per-env config.
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth-client.ts
git commit -m "feat(auth): add Better Auth React client"
```

### Task 5: Generate Better Auth tables into schema.sql

**Files:**
- Modify: `src/lib/db/schema.sql`

Better Auth needs `user`, `session`, `account`, `verification` tables. We keep the
project's single migration path (`npm run migrate` runs `schema.sql`), so we generate
the DDL and paste it into `schema.sql` rather than using Better Auth's own migrator.

- [ ] **Step 1: Generate the SQL**

Run: `npx @better-auth/cli@latest generate --config src/lib/auth.ts`
Expected: prints (or writes) the Postgres `CREATE TABLE` statements for
`user`, `session`, `account`, `verification`.
(If it writes a file, open it; if it prints, copy the output.)

- [ ] **Step 2: Paste generated DDL into schema.sql**

Append the generated statements to `src/lib/db/schema.sql`, each made idempotent
(`CREATE TABLE IF NOT EXISTS ...`). Place them ABOVE the existing
`INSERT INTO entries (...) seed` block so tables exist before any later FK.
Do NOT hand-invent columns — use exactly what the CLI produced. Verify it includes
at minimum `user(id, email, name, image, emailVerified, createdAt, updatedAt)` and
FKs from `session.userId` / `account.userId` to `user.id`.

- [ ] **Step 3: Run the migration against the dev DB**

Run: `npm run migrate`
Expected: prints `Migration complete.` with no errors.

- [ ] **Step 4: Verify tables exist**

Run: `node -e "const {neon}=require('@neondatabase/serverless');const s=neon(process.env.NEON_DB_CONNECTION_URL||process.env.DATABASE_URL);s\`SELECT table_name FROM information_schema.tables WHERE table_name IN ('user','session','account','verification') ORDER BY table_name\`.then(r=>{console.log(r.map(x=>x.table_name).join(','));process.exit(0)})"`
Expected: `account,session,user,verification`

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.sql
git commit -m "feat(auth): add Better Auth tables to schema"
```

### Task 6: Environment variables

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (local only — NOT committed)

- [ ] **Step 1: Document required env in .env.example**

Add these keys (values empty) to `.env.example`:

```
# Better Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 2: Set real local values in .env.local**

Generate a secret: `openssl rand -base64 32` → set `BETTER_AUTH_SECRET`.
Set `BETTER_AUTH_URL=http://localhost:3000`.
Create an OAuth 2.0 Client ID in Google Cloud Console (Web application), authorized
redirect URI `http://localhost:3000/api/auth/callback/google`, and paste
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
(These are also set in Vercel project env for production, with the production
callback URL added in Google Cloud.)

- [ ] **Step 3: Commit (only the example)**

```bash
git add .env.example
git commit -m "docs(auth): document Better Auth env vars"
```

### Task 7: Session helper for server code

**Files:**
- Create: `src/lib/session.ts`
- Test: `tests/lib/session.test.ts`

A single server-side helper to read the current user id from a request. Returns
`null` when unauthenticated. Pure wrapper around `auth.api.getSession`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/session.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

import { getSessionUserId } from "@/lib/session";
import { auth } from "@/lib/auth";

describe("getSessionUserId", () => {
  it("returns the user id when a session exists", async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user_123" },
    });
    const req = new Request("http://localhost/x");
    expect(await getSessionUserId(req)).toBe("user_123");
  });

  it("returns null when there is no session", async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = new Request("http://localhost/x");
    expect(await getSessionUserId(req)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: FAIL — `getSessionUserId` not exported.

- [ ] **Step 3: Implement**

```ts
// src/lib/session.ts
import { auth } from "./auth";

/** Current authenticated user id from the request cookies, or null. */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user?.id ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/session.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts tests/lib/session.test.ts
git commit -m "feat(auth): add getSessionUserId server helper"
```

### Task 8: Sign-in page

**Files:**
- Create: `src/app/signin/page.tsx`

- [ ] **Step 1: Create the sign-in page**

```tsx
// src/app/signin/page.tsx
"use client";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6">
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-md" />
        <span className="font-display text-2xl uppercase tracking-wide">
          Survivor<span className="text-accent">.</span>
        </span>
      </div>
      <p className="text-center text-sm text-muted">Sign in to track your entries.</p>
      <button
        onClick={() => signIn.social({ provider: "google", callbackURL: "/" })}
        className="btn-primary w-full"
      >
        Continue with Google
      </button>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Verify manually**

Run: `npm run dev` then visit `http://localhost:3000/signin`, click "Continue with
Google", complete the Google flow.
Expected: redirected back to `/` with a session cookie set (check DevTools →
Application → Cookies for a `better-auth.session_token` cookie).

- [ ] **Step 4: Commit**

```bash
git add src/app/signin
git commit -m "feat(auth): add Google sign-in page"
```

### Task 9: Gate the app behind auth (middleware)

**Files:**
- Create: `src/middleware.ts`

Redirect unauthenticated users to `/signin`. Allow `/signin`, `/api/auth/*`, and
Next internals through. Better Auth exposes a lightweight cookie check for middleware
(`getSessionCookie`) that does NOT hit the DB (edge-safe).

- [ ] **Step 1: Create middleware**

```ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const hasSession = getSessionCookie(req);
  if (!hasSession) {
    const url = new URL("/signin", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Protect app pages; let auth endpoints, the sign-in page, static assets, and the
// agent's API through (the agent authenticates with AGENT_WRITE_TOKEN, not a cookie).
export const config = {
  matcher: ["/((?!signin|api/auth|api/chat|api/cron|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
```

> NOTE: middleware is a coarse gate (presence of a cookie only). Real authorization
> still happens per-route in Phase 2 via `getSessionUserId`. API routes the agent uses
> are excluded from the matcher and rely on `AGENT_WRITE_TOKEN` instead.

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open an incognito window, visit `http://localhost:3000/`.
Expected: redirected to `/signin`. After signing in, `/` loads.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(auth): gate app pages behind sign-in"
```

### Task 10: Account menu + sign-out in nav

**Files:**
- Modify: `src/app/nav.tsx`

Add a small account control (avatar/initial + sign-out) to the top brand bar,
visible on all breakpoints.

- [ ] **Step 1: Add a client account button to the top bar**

In `src/app/nav.tsx`, import the client session hook at the top:

```tsx
import { useSession, signOut } from "@/lib/auth-client";
```

Inside `Nav()`, add near the top:

```tsx
const { data: session } = useSession();
```

Then, in the top-bar row that currently holds only the brand `<Link>`, add a
right-aligned control after the brand link:

```tsx
{session?.user && (
  <button
    onClick={() => signOut()}
    className="ml-auto flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
    aria-label="Sign out"
  >
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-fg">
      {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
    </span>
    Sign out
  </button>
)}
```

(The existing brand row is `flex items-center justify-between`; the `ml-auto` keeps
the control right-aligned.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, sign in, confirm the initial + "Sign out" appears; click it and
confirm you're returned to `/signin`.

- [ ] **Step 4: Commit**

```bash
git add src/app/nav.tsx
git commit -m "feat(auth): account menu and sign-out in nav"
```

### Task 11: Phase 1 checkpoint

- [ ] **Step 1: Full test + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass, exit 0, build succeeds.

- [ ] **Step 2: Manual smoke**

Incognito → `/` redirects to `/signin` → Google sign-in → land on dashboard →
sign out → back to `/signin`.

---

## Phase 2 — Per-owner entries

### Task 12: ULID id helper

**Files:**
- Create: `src/lib/ids.ts`
- Test: `tests/lib/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/ids.test.ts
import { describe, it, expect } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("returns a 26-char Crockford base32 ULID", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it("is monotonically sortable by creation time", () => {
    const a = newId();
    const b = newId();
    expect(a <= b).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/ids.test.ts`
Expected: FAIL — `newId` not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/ids.ts
import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

/** New ULID — time-sortable, index-friendly primary key. */
export function newId(): string {
  return ulid();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/ids.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ids.ts tests/lib/ids.test.ts
git commit -m "feat: ULID id generator"
```

### Task 13: Add owner_id column + backfill

**Files:**
- Modify: `src/lib/db/schema.sql`

- [ ] **Step 1: Add nullable owner_id + index**

Add to `schema.sql` (below the `entries` table, above the seed insert):

```sql
-- Multi-tenancy: every entry belongs to exactly one Better Auth user.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES "user"(id);
CREATE INDEX IF NOT EXISTS entries_owner_id_idx ON entries (owner_id);
```

- [ ] **Step 2: Run migration**

Run: `npm run migrate`
Expected: `Migration complete.`

- [ ] **Step 3: Backfill the seed entries to your user**

First get your user id (sign in via the app once so a `user` row exists), then run
(replace `<YOUR_USER_ID>`):

```bash
node -e "const {neon}=require('@neondatabase/serverless');const s=neon(process.env.NEON_DB_CONNECTION_URL||process.env.DATABASE_URL);s\`UPDATE entries SET owner_id='<YOUR_USER_ID>' WHERE owner_id IS NULL\`.then(()=>{console.log('backfilled');process.exit(0)})"
```

Expected: prints `backfilled`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.sql
git commit -m "feat(entries): add owner_id column and index"
```

### Task 14: Scope entries-repo to owner

**Files:**
- Modify: `src/lib/db/entries-repo.ts`
- Modify: `src/lib/types.ts` (add `ownerId` to `Entry` if not present)
- Test: `tests/lib/db/entries-repo.test.ts`

The repo currently returns/creates entries globally. Scope every function by owner.
Note `getEntries` uses `unstable_cache` keyed by a static tag; make it a per-owner
function (drop the static cache or key by owner) so users never see each other's data.

- [ ] **Step 1: Write the failing test (pure query-shape guard)**

```ts
// tests/lib/db/entries-repo.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
vi.mock("@/lib/db/client", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => {
      calls.push(strings.join("?") + " :: " + JSON.stringify(vals));
      return Promise.resolve([]);
    },
    {},
  ),
}));

import { getEntries } from "@/lib/db/entries-repo";

beforeEach(() => { calls.length = 0; });

describe("getEntries", () => {
  it("filters by owner_id", async () => {
    await getEntries("user_abc");
    expect(calls[0]).toContain("owner_id");
    expect(calls[0]).toContain("user_abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/db/entries-repo.test.ts`
Expected: FAIL — `getEntries` takes no arg / does not filter by owner.

- [ ] **Step 3: Rewrite entries-repo scoped by owner**

```ts
// src/lib/db/entries-repo.ts
import { sql } from "./client";
import { validateEntryName, DuplicateNameError } from "../entries-util";
import { newId } from "../ids";
import type { Entry, EntrySettings } from "../types";

/** All entries owned by a user. */
export async function getEntries(ownerId: string): Promise<Entry[]> {
  return (await sql`
    SELECT id, name, settings, owner_id AS "ownerId"
    FROM entries WHERE owner_id = ${ownerId} ORDER BY name
  `) as unknown as Entry[];
}

/** Look up a single entry's owner (for authorization checks). */
export async function getEntryOwner(id: string): Promise<string | null> {
  const rows = (await sql`SELECT owner_id AS "ownerId" FROM entries WHERE id = ${id}`) as
    { ownerId: string | null }[];
  return rows[0]?.ownerId ?? null;
}

export async function createEntry(
  ownerId: string,
  name: string,
  settings: EntrySettings = {},
): Promise<Entry> {
  const clean = validateEntryName(name);
  const dup = (await sql`
    SELECT 1 FROM entries WHERE owner_id = ${ownerId} AND lower(name) = lower(${clean})
  `) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  const id = newId();
  await sql`
    INSERT INTO entries (id, name, settings, owner_id)
    VALUES (${id}, ${clean}, ${JSON.stringify(settings)}::jsonb, ${ownerId})
  `;
  return { id, name: clean, settings, ownerId };
}

export async function deleteEntry(id: string): Promise<boolean> {
  await sql`DELETE FROM picks WHERE entry_id = ${id}`;
  const rows = (await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`) as unknown[];
  return rows.length > 0;
}

export async function renameEntry(id: string, ownerId: string, name: string): Promise<void> {
  const clean = validateEntryName(name);
  const dup = (await sql`
    SELECT 1 FROM entries WHERE owner_id = ${ownerId} AND lower(name) = lower(${clean}) AND id <> ${id}
  `) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  await sql`UPDATE entries SET name = ${clean} WHERE id = ${id}`;
}

export async function updateSettings(id: string, settings: EntrySettings): Promise<void> {
  await sql`UPDATE entries SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${id}`;
}
```

> NOTE: `unstable_cache`/`revalidateTag` are removed because caching a global list
> leaks data across users. If per-owner caching is wanted later, key the cache by
> `ownerId`. Duplicate-name uniqueness is now per-owner (two users may both have "Archie").

- [ ] **Step 4: Add ownerId to the Entry type**

In `src/lib/types.ts`, add `ownerId: string;` to the `Entry` interface.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/db/entries-repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck (expect callers to break — fixed next tasks)**

Run: `npx tsc --noEmit`
Expected: errors in files that call `getEntries()` / `createEntry()` / `renameEntry()`
with old signatures. Note them; they're addressed in Tasks 15–18.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/entries-repo.ts src/lib/types.ts tests/lib/db/entries-repo.test.ts
git commit -m "feat(entries): scope entries-repo by owner_id"
```

### Task 15: Thread ownerId through entry-status

**Files:**
- Modify: `src/lib/entry-status.ts`

- [ ] **Step 1: Accept ownerId and pass to getEntries**

Change the signature and the first line:

```ts
export async function getEntryStatuses(
  results: GameResult[],
  ownerId: string,
): Promise<EntryWithStatus[]> {
  const entries = await getEntries(ownerId);
  // ...unchanged loop body...
}
```

- [ ] **Step 2: Typecheck (callers still pending)**

Run: `npx tsc --noEmit`
Expected: `entry-status.ts` itself is clean; remaining errors are in routes (next task).

- [ ] **Step 3: Commit**

```bash
git add src/lib/entry-status.ts
git commit -m "feat(entries): thread ownerId through entry-status"
```

### Task 16: Add actor resolution helper (session OR agent-on-behalf-of)

**Files:**
- Modify: `src/lib/agent-auth.ts`
- Test: `tests/lib/agent-auth.test.ts` (extend existing)

Single helper that resolves the acting user id for a request: a logged-in user via
cookie, OR — when the valid `AGENT_WRITE_TOKEN` is presented — the on-behalf-of user
id from the `X-On-Behalf-Of` header. Returns `null` if neither authenticates.

- [ ] **Step 1: Write failing tests (append to existing file)**

```ts
// tests/lib/agent-auth.test.ts  (add these cases)
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSessionUserId: vi.fn() }));
import { resolveActorUserId } from "@/lib/agent-auth";
import { getSessionUserId } from "@/lib/session";

describe("resolveActorUserId", () => {
  const mockSession = getSessionUserId as unknown as ReturnType<typeof vi.fn>;

  it("returns the session user when logged in", async () => {
    mockSession.mockResolvedValue("user_session");
    const req = new Request("http://localhost/api/x");
    expect(await resolveActorUserId(req)).toBe("user_session");
  });

  it("returns on-behalf-of id when agent token is valid", async () => {
    mockSession.mockResolvedValue(null);
    process.env.AGENT_WRITE_TOKEN = "secret";
    const req = new Request("http://localhost/api/x", {
      headers: { authorization: "Bearer secret", "x-on-behalf-of": "user_agent_target" },
    });
    expect(await resolveActorUserId(req)).toBe("user_agent_target");
  });

  it("rejects on-behalf-of without a valid agent token", async () => {
    mockSession.mockResolvedValue(null);
    process.env.AGENT_WRITE_TOKEN = "secret";
    const req = new Request("http://localhost/api/x", {
      headers: { authorization: "Bearer wrong", "x-on-behalf-of": "user_x" },
    });
    expect(await resolveActorUserId(req)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/agent-auth.test.ts`
Expected: FAIL — `resolveActorUserId` not exported.

- [ ] **Step 3: Implement (keep existing requireAgentWrite unchanged)**

Append to `src/lib/agent-auth.ts`:

```ts
import { getSessionUserId } from "./session";

/**
 * The user id this request acts as: the logged-in user, or — for the trusted
 * automation path — the X-On-Behalf-Of user when a valid AGENT_WRITE_TOKEN is
 * presented. The on-behalf-of id is honored ONLY with a valid token (no spoofing).
 * Returns null when neither authenticates.
 */
export async function resolveActorUserId(req: Request): Promise<string | null> {
  const sessionUser = await getSessionUserId(req);
  if (sessionUser) return sessionUser;

  const token = process.env.AGENT_WRITE_TOKEN;
  if (token) {
    const header = req.headers.get("authorization") ?? "";
    if (header === `Bearer ${token}`) {
      return req.headers.get("x-on-behalf-of");
    }
  }
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lib/agent-auth.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-auth.ts tests/lib/agent-auth.test.ts
git commit -m "feat(auth): resolveActorUserId (session or agent on-behalf-of)"
```

### Task 17: Scope entry routes to the actor

**Files:**
- Modify: `src/app/api/entries/route.ts`
- Modify: `src/app/api/entries/[id]/route.ts`

Every handler resolves the actor; 401 if none. Reads use the actor's ownerId; the
`[id]` mutations verify the entry belongs to the actor before mutating.

- [ ] **Step 1: Update `entries/route.ts` GET + POST**

In `GET`, resolve the actor and scope the status query:

```ts
import { resolveActorUserId } from "@/lib/agent-auth";
// ...
export async function GET(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const week = currentWeek(schedule, new Date());
  const results = await getResultsFresh(week, resolveSeason());
  const statuses = await getEntryStatuses(results, userId);
  // ...unchanged mapping...
}
```

In `POST`, replace `requireAgentWrite` with actor resolution and pass ownerId to `createEntry`:

```ts
export async function POST(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  // ...parse name/settings unchanged...
  const e = await createEntry(userId, name, settings);
  // ...unchanged response/error handling...
}
```

- [ ] **Step 2: Update `entries/[id]/route.ts` DELETE + PATCH with ownership check**

Add a shared guard at the top of each handler:

```ts
import { resolveActorUserId } from "@/lib/agent-auth";
import { getEntryOwner, renameEntry } from "@/lib/db/entries-repo";

async function authorizeOwner(req: Request, id: string): Promise<string | Response> {
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const owner = await getEntryOwner(id);
  if (owner !== userId) return jsonApi(errorDocument([{ status: "403", title: "Forbidden", detail: "Not your entry" }]), 403);
  return userId;
}
```

Use it in `DELETE`:

```ts
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeOwner(req, id);
  if (auth instanceof Response) return auth;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}
```

And in `PATCH` (call `authorizeOwner` first; pass `auth` as ownerId to `renameEntry(id, auth, attrs.name)`):

```ts
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeOwner(req, id);
  if (auth instanceof Response) return auth;
  // ...existing body parsing...
  //   renameEntry(id, attrs.name)  ->  renameEntry(id, auth, attrs.name)
  // ...rest unchanged...
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: these two route files clean (other routes still pending in Task 18).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/entries
git commit -m "feat(entries): scope entry routes to the acting user"
```

### Task 18: Scope remaining entry/pick routes

**Files:**
- Modify: `src/app/api/recommendations/route.ts`
- Modify: `src/app/api/grid/route.ts`
- Modify: `src/app/api/picks/route.ts`
- Modify: `src/app/api/picks-state/route.ts`
- Modify: `src/app/api/pick-overrides/route.ts`

For each route: resolve the actor (401 if none), and pass `userId` into whatever
loads entries (e.g. `getEntryStatuses(results, userId)`, `getEntries(userId)`). For
pick mutation routes (`picks`, `pick-overrides`), verify the target `entryId` belongs
to the actor via `getEntryOwner(entryId) === userId` before writing (return 403 otherwise).

- [ ] **Step 1: Recommendations + grid (reads)**

At the top of each `GET`, add:

```ts
import { resolveActorUserId } from "@/lib/agent-auth";
// inside GET:
const userId = await resolveActorUserId(req); // add `req` param if the handler had none
if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
```

Then pass `userId` to the entry-loading call (`getEntryStatuses(results, userId)` or
`getEntries(userId)`), matching whatever the route currently calls.

- [ ] **Step 2: Pick mutation routes — add ownership check**

In `picks/route.ts`, `picks-state/route.ts`, and `pick-overrides/route.ts`, for each
handler that mutates a pick for an `entryId` from the request body, add:

```ts
import { resolveActorUserId } from "@/lib/agent-auth";
import { getEntryOwner } from "@/lib/db/entries-repo";
// ...after extracting entryId from the body:
const userId = await resolveActorUserId(req);
if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
if ((await getEntryOwner(entryId)) !== userId) {
  return jsonApi(errorDocument([{ status: "403", title: "Forbidden", detail: "Not your entry" }]), 403);
}
```

Remove the old `requireAgentWrite(req)` calls in these routes (superseded by
`resolveActorUserId`, which already trusts the agent token).

- [ ] **Step 3: Typecheck + full test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api
git commit -m "feat: scope all entry/pick routes to the acting user"
```

### Task 19: Client — no cross-user leakage

**Files:**
- Modify: `src/app/dashboard-client.tsx`
- Modify: `src/app/plan/page.tsx`
- Modify: `src/app/matchups/page.tsx`

The client fetches `/api/*` which are now owner-scoped server-side, so no id needs to
be sent (the session cookie carries identity). Verify no page assumes the old global
entry list, and that a 401 response redirects to `/signin`.

- [ ] **Step 1: Add a 401 guard to the dashboard loader**

In `dashboard-client.tsx` `load()`, after the `Promise.all` fetches, if any response
is 401 redirect: wrap fetches to check status, e.g.

```ts
const res = await fetch(`/api/entries`);
if (res.status === 401) { window.location.href = "/signin"; return; }
```

Apply the same guard pattern to the other two fetches in `load()`.

- [ ] **Step 2: Verify server-rendered pages**

Confirm `plan/page.tsx` and `matchups/page.tsx` (server components) call their
`/api` or repo functions in a way that now receives the session — if they call repo
functions directly (not via `/api`), pass the session user id resolved from
`getSessionUserId(headers())`. Adjust as needed so they compile and scope correctly.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: exit 0, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard-client.tsx src/app/plan/page.tsx src/app/matchups/page.tsx
git commit -m "feat: client scoping + 401 redirect to sign-in"
```

### Task 20: Enforce owner_id NOT NULL

**Files:**
- Modify: `src/lib/db/schema.sql`

Only after backfill (Task 13) and all writes set `owner_id`.

- [ ] **Step 1: Add the NOT NULL constraint**

Append to `schema.sql`:

```sql
-- All entries now have an owner; enforce it.
ALTER TABLE entries ALTER COLUMN owner_id SET NOT NULL;
```

- [ ] **Step 2: Run migration**

Run: `npm run migrate`
Expected: `Migration complete.` (fails loudly if any entry still has null owner —
if so, re-run the Task 13 backfill first).

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.sql
git commit -m "feat(entries): enforce owner_id NOT NULL"
```

---

## Phase 3 — Klaviyo agent on-behalf-of

### Task 21: Pass the user id from chat to the agent

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/klaviyo.ts` (only if the agent call needs to forward the id)

The in-app chat is authenticated (middleware + session). Attach the session user id
so the agent can call our API back with `X-On-Behalf-Of`.

- [ ] **Step 1: Resolve the session user in the chat route**

In `chat/route.ts` `POST`, add:

```ts
import { getSessionUserId } from "@/lib/session";
// ...after parsing message:
const userId = await getSessionUserId(req);
if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
```

- [ ] **Step 2: Forward the user id to the agent**

Pass `userId` into `createResponse`/`frameForRouting` so the agent knows which user
it is acting for (e.g. include it in the framing text or conversation metadata). The
agent, when it calls our write API, must send `Authorization: Bearer <AGENT_WRITE_TOKEN>`
and `X-On-Behalf-Of: <userId>` — which Task 16's `resolveActorUserId` already honors.
Update `frameForRouting(message, userId)` signature in `src/lib/klaviyo.ts` to embed
the id in the routed message.

- [ ] **Step 3: Typecheck + test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: exit 0, all pass. (Update `tests/lib/klaviyo.test.ts` if `frameForRouting`'s
signature changed — add the `userId` arg to existing calls.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts src/lib/klaviyo.ts tests/lib/klaviyo.test.ts
git commit -m "feat(agent): pass session user id for on-behalf-of writes"
```

### Task 22: Update the agent provisioning script

**Files:**
- Modify: `scripts/` (the Klaviyo agent provisioning script — commit `6e19b5b`)

- [ ] **Step 1: Document the new write contract for the agent**

Ensure the agent's tool definitions instruct it to send both
`Authorization: Bearer <AGENT_WRITE_TOKEN>` and `X-On-Behalf-Of: <userId>` on every
write to `/api/entries*`, `/api/picks*`, `/api/pick-overrides`. Update the provisioning
script/knowledge accordingly.

- [ ] **Step 2: Commit**

```bash
git add scripts
git commit -m "feat(agent): send on-behalf-of user id on writes"
```

---

## Phase 4 — Apple (deferred; do not implement now)

### Task 23: Add Apple provider (later)

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/app/signin/page.tsx`

When ready: enroll in the Apple Developer Program ($99/yr), create a Services ID + a
`.p8` key, and add to `socialProviders.apple` in `src/lib/auth.ts` (Better Auth mints
the ES256 client-secret JWT per request, so nothing to rotate). Add an "Continue with
Apple" button mirroring the Google one. Add `APPLE_CLIENT_ID` / `APPLE_*` env to
`.env.example` and Vercel. Register the Apple callback URL. Out of scope for this plan.

---

## Rollout notes

- **Vercel env:** set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (production URL),
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and keep `AGENT_WRITE_TOKEN`. Add the
  production Google callback URL in Google Cloud Console.
- **Migration order:** deploy Phase 1 (login works), backfill owners (Task 13),
  deploy Phase 2, then enforce NOT NULL (Task 20).
- **Cron route** (`/api/cron/refresh`) is data-refresh only (no per-user entries) and
  stays excluded from the auth gate.
```
