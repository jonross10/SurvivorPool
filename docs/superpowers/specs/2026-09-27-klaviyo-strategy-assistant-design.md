# Klaviyo Customer Agent — Survivor Strategy Assistant — Design

**Date:** 2026-09-27
**Status:** Approved (pending spec review)

## Problem

We want an in-app chat assistant to talk through survivor-pool strategy and picks —
grounded in the app's live data (entries, odds, results, the portfolio projection),
and able to make/swap picks on request. We're building it on **Klaviyo's Customer
Agent** (beta): a managed agent platform where we register HTTP **tools**,
**knowledge**, and a **skill** (whose instructions are the strategist persona), then
drive it via a conversation + response API.

## Hard Prerequisite

Klaviyo access is **not yet sorted**. This feature cannot work end-to-end until:
- A Klaviyo account has **Customer Agent (beta)** enabled, and
- A **private API key** with `agents:read` / `agents:write` scopes exists.

The app-side work (chat UI, `/api/chat`, the reused data/write routes, the
provisioning script) is built and unit/integration-tested **independently**; the
Klaviyo wiring is exercised once the key exists. All Klaviyo endpoints are beta
(`revision: 2026-07-15.pre`) and marked "not for production" — accepted risk.

## Goals

1. Chat assistant that answers survivor strategy questions grounded in live app data.
2. It can **make/swap picks** on explicit confirmation.
3. Available as a **slide-over panel** on every page **and** a dedicated **`/assistant`** tab (one shared component).
4. Reuse the app's existing APIs — no parallel data layer.

## Non-Goals

- Multi-user / per-profile customer identities in Klaviyo. **Future work** — the
  `POST /api/customer-agent-conversations` `customer` object (email / `profile_id`)
  is the extension point; for now conversations are created with no customer identity.
- Streaming responses (Klaviyo's response API is non-streaming).
- Opponent modeling / any change to the strategy engine itself.

## Key Decisions

### Reuse existing routes; no `/api/agent/*` layer

The agent needs the same data the UI already fetches, so its tools call the existing
routes. The only real difference is auth (below).

| Klaviyo agent-tool | App route it calls | Purpose |
|---|---|---|
| `get_entries` / `get_projection` | `GET /api/recommendations` | per-entry status, current pick, `projectedPath`, eliminated, `meta.weeks` |
| `get_matchups` | `GET /api/matchups?filter[week]={{week}}` | odds, spreads, win %, results for a week |
| `make_pick` | `POST /api/picks` | record/swap a pick (reuses existing validation) |

Klaviyo tool `{{variable}}` templating maps onto these (including `filter[week]`).

### JSON:API route rename (prep)

Rename the pick mutation routes to proper collection names before wiring the agent:
- `src/app/api/pick/` → `src/app/api/picks/`
- `src/app/api/pick-override/` → `src/app/api/pick-overrides/`
- Update the 4 URL strings in `src/lib/api-client.ts`.

The JSON:API `type` values (`"pick"`, `"pick-override"`) are unchanged. All client
callers go through `api-client.ts`, so this is a contained rename.

### Auth: bearer token on mutations only

- **Reads** (`/api/recommendations`, `/api/matchups`): the site is public, so read
  tools need no auth — they hit the live URLs.
- **Writes** (`/api/picks`, and for consistency `/api/pick-overrides`): add a bearer
  check. If `AGENT_WRITE_TOKEN` is set, a request carrying
  `Authorization: Bearer <token>` is authorized; the Klaviyo `make_pick` tool injects
  it from a stored **agent-secret**. When `AGENT_WRITE_TOKEN` is unset (local dev),
  the check is skipped so the UI keeps working. This also becomes the
  server-to-server auth that bypasses any future site password gate.
  (Browser UI mutations remain unauthenticated as today; this only *adds* an accepted
  bearer path — it does not yet require auth for the browser.)

### Write safety (3 layers)

1. `AGENT_WRITE_TOKEN` bearer — only the agent (or an authorized caller) can POST.
2. Skill `instructions` require the agent to state the intended pick and get an
   explicit "yes" in chat **before** calling `make_pick`.
3. `/api/picks` reuses existing validation (UNIQUE team/week, valid entry) — bad
   calls fail safely.

## Components

### 1. Provisioning script — `scripts/provision-agent.ts` (control plane, run once)

Uses `KLAVIYO_API_KEY` to create, in order:
- **agent-secret** holding `AGENT_WRITE_TOKEN` (for the write tool).
- **4 agent-tools** (`get_entries`, `get_projection`, `get_matchups`, `make_pick`)
  as `details.type: "custom"` HTTP templates whose `url_template` points at the
  deployed base URL (`APP_BASE_URL`). `make_pick` sets an `Authorization: Bearer`
  header sourced from the agent-secret (`source: "secret"`).
- **agent-knowledge** snippets (survivor rules; tie/pool/min-win-chance meaning; how
  to read the projection — stud-saving, diversification, survival curve; "always call
  the tools, never guess numbers").
- **1 agent-skill** "Survivor Strategy": `display_name`, `description` (routes
  strategy/pick chat to it), `instructions` (the strategist system prompt + the
  confirm-before-`make_pick` rule), `handoff: "none"`, and the `agent-tools`
  relationship binding all four tools.

Prints the created IDs. Skips resources that 409 (already exist) so it can be re-run.

### 2. `/api/chat` route (data plane)

- `POST` with `{ conversationId?: string, message: string }`.
- If no `conversationId`: `POST /api/customer-agent-conversations`
  (`mode` from `KLAVIYO_AGENT_MODE`, `channel: "web-chat"`, no `customer`) → return
  the new `conversation_id` alongside the reply.
- Then `POST /api/customer-agent-responses` with `conversation` relationship +
  `messages: [{ role: "user", content }]`.
- Extract `message` events (`role: "agent"`) → return `{ conversationId, messages: string[] }`.
- Catch Klaviyo 4xx/5xx and surface `handoff`/`error` events → return a clean
  `{ error }` the UI renders. Server-only; `KLAVIYO_API_KEY` never reaches the browser.

### 3. Chat UI — shared `<AssistantChat>` component

- One component: message list + input + "thinking…" indicator (non-streaming), holds
  `conversationId` in state and mirrors it to `sessionStorage` so a refresh keeps the
  thread. Talks only to `/api/chat`.
- **Slide-over:** a floating button (bottom-right, in `layout.tsx` so it's on every
  page) toggles a drawer rendering `<AssistantChat>`.
- **Tab:** `/assistant` page renders the same `<AssistantChat>` full-width; add
  "Assistant" to the nav.

## Data Flow

```
UI (<AssistantChat>) → POST /api/chat
   → [first turn] POST /api/customer-agent-conversations → conversation_id
   → POST /api/customer-agent-responses (conversation_id, user message)
        → Klaviyo agent loop: match Survivor Strategy skill
             → calls get_entries / get_projection / get_matchups (GET, app URLs)
             → make_pick (POST /api/picks, Bearer AGENT_WRITE_TOKEN) after in-chat confirm
        → event list (agent messages)
   → /api/chat returns { conversationId, messages }
UI appends agent messages
```

## Config / Secrets (server-only env)

| Var | Purpose |
|---|---|
| `KLAVIYO_API_KEY` | Private key (agents scopes) for control + data plane calls |
| `KLAVIYO_AGENT_MODE` | `preview` (dev) or `live` (prod) |
| `AGENT_WRITE_TOKEN` | Bearer shared with the Klaviyo agent-secret; gates `/api/picks` + `/api/pick-overrides` writes |
| `APP_BASE_URL` | Deployed base URL the agent-tools call (used by the provisioning script) |

## Error Handling

- `/api/chat` wraps Klaviyo calls in try/catch; maps non-2xx and `error`/`handoff`
  events to `{ error: "…" }`. The UI shows an inline retry message, never a raw stack.
- The bearer check on writes returns `401` with a JSON:API error when a token is
  configured and missing/wrong.

## Testing

- **Unit:** the bearer-check helper on the mutation routes (authorized / missing /
  wrong token, and skipped-when-unset); `/api/chat` event extraction (given a mock
  Klaviyo response, returns the right agent messages / error).
- **Manual (once Klaviyo key exists):** run the provisioning script; open the chat;
  ask a strategy question and confirm it calls the read tools; confirm a pick and
  verify it lands via `/api/picks`.
- No change to the strategy engine, so its existing tests stand.

## Phasing

1. Route rename (`/api/picks`, `/api/pick-overrides`) + bearer check on writes.
2. `/api/chat` orchestration + tests.
3. `<AssistantChat>` component + slide-over + `/assistant` tab + nav.
4. `scripts/provision-agent.ts`.
5. (Blocked on Klaviyo key) provision + manual end-to-end verification.

## Future Work

- **Multi-user / profiles:** pass `customer` (email / `profile_id`) when creating
  conversations so threads and history attach to the right Klaviyo profile; scope
  chat + data to the signed-in user.
