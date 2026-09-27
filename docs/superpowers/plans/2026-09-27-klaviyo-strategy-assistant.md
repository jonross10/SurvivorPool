# Klaviyo Strategy Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app survivor-strategy chat assistant powered by Klaviyo's Customer Agent, grounded in the app's live data via HTTP tools and able to make picks on confirmation.

**Architecture:** The agent is provisioned in Klaviyo (tools → knowledge → skill) by a one-time script; its HTTP tools call the app's existing routes. At runtime a `/api/chat` route creates a Klaviyo conversation and relays messages to the Customer Agent response API; a shared `<AssistantChat>` component is surfaced as a slide-over on every page and a `/assistant` tab. Mutation routes gain an optional bearer gate (off by default).

**Tech Stack:** Next.js 15 (App Router), TypeScript, vitest. Klaviyo Customer Agent beta API (`revision: 2026-07-15.pre`). No new npm deps.

**Reference spec:** `docs/superpowers/specs/2026-09-27-klaviyo-strategy-assistant-design.md`

**Prerequisite (blocks only Phase 7):** a Klaviyo account with Customer Agent enabled + a private API key with `agents:read`/`agents:write`. Phases 1–6 are built and tested without it.

---

## Phase 1 — JSON:API route rename

### Task 1: Rename pick / pick-override routes to plural collections

**Files:**
- Rename: `src/app/api/pick/` → `src/app/api/picks/`
- Rename: `src/app/api/pick-override/` → `src/app/api/pick-overrides/`
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Move the route folders with git**

```bash
cd /Users/jonross/SurvivorPool
git mv src/app/api/pick src/app/api/picks
git mv src/app/api/pick-override src/app/api/pick-overrides
```

- [ ] **Step 2: Update the URL strings in `api-client.ts`**

In `src/lib/api-client.ts`, change the four route URLs (the JSON:API `type` args stay `"pick"` / `"pick-override"`):

```ts
export function recordPick(entry: string, week: number, team: string, winProb: number): Promise<Response> {
  return send("/api/picks", "POST", { entry, week, team, winProb }, "pick");
}

export function removePick(entry: string, week: number): Promise<Response> {
  return send("/api/picks", "DELETE", { entry, week }, "pick");
}

export function setPickOverride(
  entry: string, week: number, outcome: "survived" | "out" | "revived",
): Promise<Response> {
  return send("/api/pick-overrides", "POST", { entry, week, outcome }, "pick-override");
}

export function clearPickOverride(entry: string, week: number): Promise<Response> {
  return send("/api/pick-overrides", "DELETE", { entry, week });
}
```

- [ ] **Step 3: Confirm no other references remain**

Run: `grep -rn '"/api/pick"\|"/api/pick-override"\|/api/pick"\|/api/pick-override"' src`
Expected: no matches.

- [ ] **Step 4: Typecheck + tests**

Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → all pass.

- [ ] **Step 5: Verify the renamed routes serve (dev server on :3000, public)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/picks -H 'content-type: application/vnd.api+json' -d '{"data":{"attributes":{"entry":"__nobody__","week":1,"team":"KC"}}}'
```
Expected: `400` (route exists, rejects unknown entry — proves the path resolves, not a 404).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename pick routes to /api/picks and /api/pick-overrides (JSON:API collections)"
```

---

## Phase 2 — Bearer gate on mutations (off by default)

### Task 2: `requireAgentWrite` auth helper

**Files:**
- Create: `src/lib/agent-auth.ts`
- Test: `tests/lib/agent-auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/agent-auth.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { requireAgentWrite } from "@/lib/agent-auth";

const orig = process.env.AGENT_WRITE_TOKEN;
afterEach(() => { process.env.AGENT_WRITE_TOKEN = orig; });

function req(auth?: string): Request {
  return new Request("http://x/api/picks", { method: "POST", headers: auth ? { authorization: auth } : {} });
}

describe("requireAgentWrite", () => {
  it("allows any request when no token is configured", () => {
    delete process.env.AGENT_WRITE_TOKEN;
    expect(requireAgentWrite(req())).toBeNull();
    expect(requireAgentWrite(req("Bearer whatever"))).toBeNull();
  });

  it("allows a request with the correct bearer token", () => {
    process.env.AGENT_WRITE_TOKEN = "secret123";
    expect(requireAgentWrite(req("Bearer secret123"))).toBeNull();
  });

  it("rejects missing or wrong token when configured", () => {
    process.env.AGENT_WRITE_TOKEN = "secret123";
    const missing = requireAgentWrite(req());
    const wrong = requireAgentWrite(req("Bearer nope"));
    expect(missing?.status).toBe(401);
    expect(wrong?.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/agent-auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/lib/agent-auth.ts`:

```ts
import { errorDocument, jsonApi } from "./jsonapi";
import type { NextResponse } from "next/server";

/**
 * Gate for mutation routes. Returns a 401 response to return early, or null to proceed.
 * When AGENT_WRITE_TOKEN is unset (default), all writes are allowed — the browser UI
 * and the agent both post freely to the public site. When it is set, writes require
 * `Authorization: Bearer <AGENT_WRITE_TOKEN>` (the automation/agent path, and the way
 * to bypass any future site gate). Setting it therefore locks down ALL writes.
 */
export function requireAgentWrite(req: Request): NextResponse | null {
  const token = process.env.AGENT_WRITE_TOKEN;
  if (!token) return null;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${token}`) return null;
  return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Valid write token required" }]), 401);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/agent-auth.test.ts`
Expected: PASS (3 tests). Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-auth.ts tests/lib/agent-auth.test.ts
git commit -m "feat: requireAgentWrite bearer gate for mutations (off unless AGENT_WRITE_TOKEN set)"
```

---

### Task 3: Apply the gate to picks and pick-overrides

**Files:**
- Modify: `src/app/api/picks/route.ts`
- Modify: `src/app/api/pick-overrides/route.ts`

- [ ] **Step 1: Gate `picks` POST and DELETE**

In `src/app/api/picks/route.ts`, add the import and a guard as the first line of both handlers:

```ts
import { requireAgentWrite } from "@/lib/agent-auth";
```

At the start of `POST(req: Request)`:

```ts
export async function POST(req: Request) {
  const unauth = requireAgentWrite(req);
  if (unauth) return unauth;
  const { entry, week, team, winProb } = await readAttrs(req);
```

At the start of `DELETE(req: Request)`:

```ts
export async function DELETE(req: Request) {
  const unauth = requireAgentWrite(req);
  if (unauth) return unauth;
  const { entry, week } = await readAttrs(req);
```

- [ ] **Step 2: Gate `pick-overrides` POST and DELETE the same way**

In `src/app/api/pick-overrides/route.ts`, add the same import and the same two-line guard at the start of both `POST` and `DELETE` (before `const { entry, week... } = await readAttrs(req);`).

- [ ] **Step 3: Typecheck + verify browser writes still work (token unset)**

Run: `npx tsc --noEmit` → no errors.
Run (token unset in dev, so this should still 400 for bad entry, not 401):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/picks -H 'content-type: application/vnd.api+json' -d '{"data":{"attributes":{"entry":"__nobody__","week":1,"team":"KC"}}}'
```
Expected: `400` (gate is off because AGENT_WRITE_TOKEN is unset).

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/picks/route.ts" "src/app/api/pick-overrides/route.ts"
git commit -m "feat: gate pick/override mutations with requireAgentWrite"
```

---

## Phase 3 — Klaviyo client + message extraction

### Task 4: `extractAgentMessages` (pure)

**Files:**
- Create: `src/lib/klaviyo.ts`
- Test: `tests/lib/klaviyo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/klaviyo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractAgentMessages } from "@/lib/klaviyo";

describe("extractAgentMessages", () => {
  it("returns agent message contents in order", () => {
    const events = [
      { type: "message", role: "user", content: "hi" },
      { type: "message", role: "agent", content: "Hello!" },
      { type: "message", role: "agent", content: "How can I help?" },
    ];
    expect(extractAgentMessages(events)).toEqual(["Hello!", "How can I help?"]);
  });

  it("ignores non-message events (handoff, error, tool) and non-agent roles", () => {
    const events = [
      { type: "handoff", mode: "soft" },
      { type: "message", role: "user", content: "hi" },
      { type: "error", message: "boom" },
      { type: "message", role: "agent", content: "Reply" },
    ];
    expect(extractAgentMessages(events)).toEqual(["Reply"]);
  });

  it("returns [] for empty or missing input", () => {
    expect(extractAgentMessages([])).toEqual([]);
    expect(extractAgentMessages(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/klaviyo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `extractAgentMessages` + the client wrapper**

Create `src/lib/klaviyo.ts`:

```ts
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2026-07-15.pre";

export interface AgentEvent {
  type: string;
  role?: string;
  content?: string;
  [k: string]: unknown;
}

/** Pull the agent's text replies out of a Customer Agent response event list. */
export function extractAgentMessages(events: AgentEvent[] | undefined): string[] {
  return (events ?? [])
    .filter((e) => e.type === "message" && e.role === "agent" && typeof e.content === "string")
    .map((e) => e.content as string);
}

function headers(): Record<string, string> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error("KLAVIYO_API_KEY is not set");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}

function mode(): "preview" | "live" {
  return process.env.KLAVIYO_AGENT_MODE === "live" ? "live" : "preview";
}

/** Create a Customer Agent conversation; returns its id. */
export async function createConversation(): Promise<string> {
  const res = await fetch(`${BASE}/customer-agent-conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: { type: "customer-agent-conversation", attributes: { mode: mode(), channel: "web-chat" } },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo conversation create failed: ${res.status}`);
  const doc = await res.json();
  return doc.data.id as string;
}

/** Send a user message to an existing conversation; returns the agent's reply events. */
export async function createResponse(conversationId: string, message: string): Promise<AgentEvent[]> {
  const res = await fetch(`${BASE}/customer-agent-responses`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "customer-agent-response",
        attributes: { mode: mode(), messages: [{ role: "user", content: message }] },
        relationships: { conversation: { data: { type: "customer-agent-conversation", id: conversationId } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo response failed: ${res.status}`);
  const doc = await res.json();
  return (doc.data?.attributes?.events ?? []) as AgentEvent[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/klaviyo.test.ts`
Expected: PASS (3 tests). Run `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/klaviyo.ts tests/lib/klaviyo.test.ts
git commit -m "feat: Klaviyo Customer Agent client + agent-message extraction"
```

---

## Phase 4 — Chat API route

### Task 5: `/api/chat`

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/chat/route.ts`:

```ts
import { createConversation, createResponse, extractAgentMessages } from "@/lib/klaviyo";
import { errorDocument, jsonApi } from "@/lib/jsonapi";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message: string = body?.message ?? "";
  let conversationId: string | undefined = body?.conversationId;
  if (!message.trim()) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "message is required" }]), 400);
  }
  try {
    if (!conversationId) conversationId = await createConversation();
    const events = await createResponse(conversationId, message);
    return jsonApi({ conversationId, messages: extractAgentMessages(events) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[chat] failed:", detail);
    return jsonApi(errorDocument([{ status: "502", title: "Assistant unavailable", detail }]), 502);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Verify graceful failure without a key (dev)**

With `KLAVIYO_API_KEY` unset in dev, run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/chat -H 'content-type: application/json' -d '{"message":"hi"}'
```
Expected: `502` (clean error, not a crash — the route caught the missing-key throw).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: /api/chat relays messages to the Klaviyo Customer Agent"
```

---

## Phase 5 — Chat UI

### Task 6: `<AssistantChat>` component

**Files:**
- Create: `src/components/AssistantChat.tsx`

- [ ] **Step 1: Implement the shared chat component**

Create `src/components/AssistantChat.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "agent"; text: string }

const STORAGE_KEY = "assistant_conversation_id";

export default function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    convId.current = sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId.current }),
      });
      const doc = await res.json();
      if (!res.ok) throw new Error(doc?.errors?.[0]?.detail ?? "Assistant error");
      convId.current = doc.conversationId;
      if (doc.conversationId) sessionStorage.setItem(STORAGE_KEY, doc.conversationId);
      setMessages((m) => [...m, ...(doc.messages ?? []).map((t: string) => ({ role: "agent" as const, text: t }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">
            Ask about picks, matchups, or your season plan.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"
            }`}>{m.text}</span>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-400">Thinking…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the assistant…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → no errors.

```bash
git add src/components/AssistantChat.tsx
git commit -m "feat: shared AssistantChat component"
```

---

### Task 7: Slide-over widget on every page + `/assistant` tab + nav

**Files:**
- Create: `src/components/AssistantWidget.tsx`
- Create: `src/app/assistant/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/nav.tsx`

- [ ] **Step 1: Create the floating slide-over widget**

Create `src/components/AssistantWidget.tsx`:

```tsx
"use client";
import { useState } from "react";
import AssistantChat from "./AssistantChat";

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-xl text-white shadow-lg hover:bg-emerald-700"
      >
        💬
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold">Assistant</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <AssistantChat />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Mount the widget in the layout**

In `src/app/layout.tsx`, import the widget and render it inside `<body>` after `{children}`:

```tsx
import AssistantWidget from "@/components/AssistantWidget";
```

```tsx
      <body className="font-sans antialiased">
        <Nav />
        {children}
        <AssistantWidget />
      </body>
```

- [ ] **Step 3: Create the `/assistant` tab page**

Create `src/app/assistant/page.tsx`:

```tsx
import AssistantChat from "@/components/AssistantChat";

export default function AssistantPage() {
  return (
    <main className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-6">
      <h1 className="mb-3 text-2xl font-bold tracking-tight">Assistant</h1>
      <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <AssistantChat />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Add the nav link**

In `src/app/nav.tsx`, add to `LINKS` after the Plan entry:

```ts
  { href: "/assistant", label: "Assistant" },
```

- [ ] **Step 5: Typecheck + verify pages render (dev)**

Run: `npx tsc --noEmit` → no errors.
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/assistant` → `200`.

- [ ] **Step 6: Commit**

```bash
git add src/components/AssistantWidget.tsx src/app/assistant/page.tsx src/app/layout.tsx src/app/nav.tsx
git commit -m "feat: assistant slide-over widget on every page + /assistant tab + nav"
```

---

## Phase 6 — Provisioning script

### Task 8: `scripts/provision-agent.ts`

**Files:**
- Create: `scripts/provision-agent.ts`

- [ ] **Step 1: Implement the provisioning script**

Create `scripts/provision-agent.ts`. It reads `KLAVIYO_API_KEY` and `APP_BASE_URL`, creates the tools/knowledge/skill, and prints IDs. `make_pick` ships with **no** auth header (the site is public today); a comment documents adding the bearer when locking down.

```ts
/**
 * One-time Klaviyo Customer Agent provisioning.
 * Run: KLAVIYO_API_KEY=... APP_BASE_URL=https://survivor-pool-ebon.vercel.app npx tsx scripts/provision-agent.ts
 * Re-runnable: resources that 409 (already exist) are skipped.
 */
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2026-07-15.pre";
const APP = process.env.APP_BASE_URL;
const KEY = process.env.KLAVIYO_API_KEY;
if (!KEY || !APP) { console.error("Set KLAVIYO_API_KEY and APP_BASE_URL"); process.exit(1); }

async function post(path: string, data: unknown): Promise<{ id?: string; status: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${KEY}`,
      revision: REVISION,
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({ data }),
  });
  if (res.status === 409) { console.log(`  (exists) ${path}`); return { status: 409 }; }
  if (!res.ok) { console.error(`  FAILED ${path}: ${res.status} ${await res.text()}`); process.exit(1); }
  const doc = await res.json();
  return { id: doc.data?.id, status: res.status };
}

function httpTool(name: string, description: string, method: string, urlTemplate: string, variables: unknown[] = []) {
  return {
    type: "agent-tool",
    attributes: {
      name,
      public_description: description,
      details: {
        type: "custom",
        protocol: "https",
        request_template: { url_template: urlTemplate, http_method: method, request_timeout_seconds: 10 },
        variables,
        timeout_seconds: 10,
        max_retries: 1,
      },
    },
  };
}

async function main() {
  console.log("Creating tools…");
  const getEntries = await post("/agent-tools", httpTool(
    "get_entries", "Get every entry's status, current pick, used teams, and season projection.",
    "GET", `${APP}/api/recommendations`,
  ));
  const getMatchups = await post("/agent-tools", httpTool(
    "get_matchups", "Get a week's games with odds, spreads, win %, and results.",
    "GET", `${APP}/api/matchups?filter[week]={{week}}`,
    [{ name: "week", type: "number", required: true, description: "NFL week number", source: "dynamic" }],
  ));
  // make_pick: POST body via template. No auth header today (site is public).
  // TO LOCK DOWN LATER: set AGENT_WRITE_TOKEN on the app, create a Klaviyo agent-secret
  // holding that token, and add an `Authorization: Bearer {{token}}` header here with a
  // variable {name:"token", source:"secret", value:"<agent-secret id>"}.
  const makePick = await post("/agent-tools", {
    type: "agent-tool",
    attributes: {
      name: "make_pick",
      public_description: "Record or swap a pick for an entry in a given week. Confirm with the user first.",
      details: {
        type: "custom",
        protocol: "https",
        request_template: {
          url_template: `${APP}/api/picks`,
          http_method: "POST",
          request_timeout_seconds: 10,
          headers: [{ name: "content-type", value: "application/vnd.api+json" }],
          body_template: { data: { type: "pick", attributes: { entry: "{{entry}}", week: "{{week}}", team: "{{team}}" } } },
        },
        variables: [
          { name: "entry", type: "string", required: true, description: "Entry name", source: "dynamic" },
          { name: "week", type: "number", required: true, description: "NFL week", source: "dynamic" },
          { name: "team", type: "string", required: true, description: "Team abbreviation, e.g. KC", source: "dynamic" },
        ],
        timeout_seconds: 10,
        max_retries: 0,
      },
    },
  });

  console.log("Creating knowledge…");
  const knowledge = [
    ["Survivor rules", "In an NFL survivor pool, each week you pick one team to win. If your team loses (or ties, unless the entry's settings say ties survive), you're eliminated. You cannot pick the same team twice in a season."],
    ["Reading the projection", "get_entries returns each entry's projectedPath: the season-optimal one-team-per-week plan. Entries in the same pool are diversified so they don't share a team in a week. A team may be 'saved' for a later week where it's more valuable. Never invent numbers — call the tools."],
    ["Settings meaning", "ties_survive: whether a tie keeps the entry alive. pool: entries in the same pool are planned together. min_win_chance: the entry won't be advised a current-week team below this win probability."],
  ];
  for (const [title, content] of knowledge) {
    await post("/agent-knowledge", { type: "agent-knowledge", attributes: { source: { source_type: "snippet", title, content } } });
  }

  console.log("Creating skill…");
  const toolIds = [getEntries.id, getMatchups.id, makePick.id].filter(Boolean).map((id) => ({ type: "agent-tool", id }));
  await post("/agent-skills", {
    type: "agent-skill",
    attributes: {
      display_name: "Survivor Strategy",
      description: "Answers NFL survivor pool strategy questions, recommends and makes picks. Use for anything about entries, picks, matchups, odds, or the season plan.",
      instructions:
        "You are a sharp NFL survivor-pool strategist for this app. Always ground answers in live data: call get_entries and get_matchups (and use the projection) before giving numbers — never guess. Explain trade-offs (safety vs saving strong teams for later, diversification across the pool). You may record a pick with make_pick, but ONLY after stating the exact entry, week, and team and getting the user's explicit 'yes' in this chat. Be concise.",
      status: "draft",
      handoff: "none",
    },
    relationships: toolIds.length ? { "agent-tools": { data: toolIds } } : undefined,
  });

  console.log("Done. Review the skill in Klaviyo and set status=live when ready.");
}
main();
```

- [ ] **Step 2: Typecheck (script is excluded from the build but should still typecheck)**

Run: `npx tsc --noEmit` → no errors. (If `scripts/` isn't in the tsconfig include, run `npx tsc --noEmit scripts/provision-agent.ts` to check it in isolation; fix any type errors.)

- [ ] **Step 3: Commit**

```bash
git add scripts/provision-agent.ts
git commit -m "feat: Klaviyo agent provisioning script (tools, knowledge, skill)"
```

---

## Phase 7 — Provision & verify (BLOCKED on Klaviyo key — manual runbook, no code)

Do these once a Klaviyo account has Customer Agent enabled and you have a private key.

- [ ] Set Vercel env vars (Production): `KLAVIYO_API_KEY`, `KLAVIYO_AGENT_MODE=live`, `APP_BASE_URL=https://<your-app>.vercel.app`. Leave `AGENT_WRITE_TOKEN` unset for now (writes stay open).
- [ ] Run the provisioning script locally against prod:
  `KLAVIYO_API_KEY=... APP_BASE_URL=https://<your-app>.vercel.app npx tsx scripts/provision-agent.ts`
- [ ] In Klaviyo, review the "Survivor Strategy" skill and set its status to **live**; confirm the Customer Agent itself is configured.
- [ ] Deploy; open the app; use the 💬 widget: ask "who should Jon pick this week and why?" — confirm the reply cites real odds (agent called the tools).
- [ ] Ask it to make a pick ("lock in SF for Jon week 5"), confirm when it asks, and verify the pick appears on the dashboard (came through `/api/picks`).
- [ ] (Optional, later) To lock down writes: set `AGENT_WRITE_TOKEN`, create a Klaviyo agent-secret with that value, add the `Authorization: Bearer` header to the `make_pick` tool (see the comment in the script), and add a browser-side write auth path.

---

## Self-Review Notes

- **Spec coverage:** route rename (T1), bearer gate off-by-default (T2–T3), Klaviyo client + extraction (T4), `/api/chat` (T5), shared `<AssistantChat>` + slide-over + `/assistant` tab + nav (T6–T7), provisioning tools/knowledge/skill (T8), prereq + provision/verify runbook (Phase 7), multi-user noted as future (spec only). Reuse-existing-routes honored (tools point at `/api/recommendations`, `/api/matchups`, `/api/picks`).
- **Deviations from spec, intentional & documented:** (1) `make_pick` ships without the bearer header initially because the site is public — the secret/agent-secret wiring (whose create endpoint wasn't in the reviewed docs) is deferred to the lock-down step, avoiding a guessed API. (2) The bearer gate is enforced only when `AGENT_WRITE_TOKEN` is set, so it's a real gate, not a no-op, while keeping today's browser writes working.
- **Type/name consistency:** `requireAgentWrite`, `extractAgentMessages`, `createConversation`, `createResponse`, `AgentEvent`, `AssistantChat`, `AssistantWidget`, `STORAGE_KEY` used consistently. `/api/chat` returns `{ conversationId, messages }`, which the component consumes verbatim.
- **Testing matches repo convention:** pure logic (`requireAgentWrite`, `extractAgentMessages`) is unit-tested; routes/UI are thin glue verified with curl/browser; the provisioning script and end-to-end agent flow are the manual runbook (Phase 7), since they need the Klaviyo key.
