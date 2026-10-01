# 0001 — Everything is a JSON:API route, gated by dual auth

**Status:** Accepted

## Context

The app has two very different clients: a human using the web UI (authenticated by a browser
session) and the Klaviyo Customer Agent acting on a user's behalf (no browser, no cookie). We
needed the agent to be able to do essentially anything the UI can — read status, run what-if
projections, create entries, make picks — without building and maintaining a second, parallel
surface just for automation.

A common shortcut is to let the UI call privileged server actions directly (server components /
server actions touching the DB) and bolt on a thin, separate API for machines. That path tends
to drift: the two surfaces grow different capabilities, different validation, and different bugs.

## Decision

Responses follow the [JSON:API specification](https://jsonapi.org/) (`resource` / `document` /
error shapes live in `src/lib/jsonapi.ts`, with a matching client in `jsonapi-client.ts`) so both
clients parse one consistent envelope.

**All state is read and written through JSON:API route handlers under `/api`. There is no
privileged UI backdoor** — the dashboard uses the same endpoints the agent does. The only thing
that differs is authentication, resolved in one place by `resolveActorUserId(req)`
(`src/lib/agent-auth.ts`):

1. If the request carries a valid Better Auth **session cookie**, it acts as that user. A valid
   session always wins and any `?userId=` / `?email=` param is ignored, so a signed-in user can
   never act as someone else.
2. Otherwise, if the request carries the valid shared **`X-API-Key`**, it acts as the user named
   by `?userId=` (our id) or `?email=` (mapped to our id). This is the agent path, and it is
   honored *only* when the key is valid, so it can't be spoofed.

Page routes are separately gated by `src/middleware.ts`, a coarse edge-level presence check that
redirects sessionless visitors to `/signin`. API routes are excluded from that matcher so the
(cookieless) agent is never redirected; their real authorization is the per-request
`resolveActorUserId` call.

## Consequences

**Good:**
- One capability surface. A feature added for the UI is automatically available to the agent and
  vice versa — this is exactly how `get_week_options` and `plan_whatif` were added (extend an
  endpoint / add one, then point a tool at it).
- Authorization lives in exactly one function; routes just ask "who is acting?" and get a user id
  or null.
- Testable: auth resolution is unit-tested (`tests/lib/agent-auth.test.ts`) independent of routes.

**Costs / trade-offs:**
- A single shared `API_KEY` authenticates the whole agent path. It is a bearer secret that names
  arbitrary users, so it must stay server-side only (never shipped to a client) and rotate if
  leaked. Per-agent keys or signed per-user tokens would be stronger; the shared key was chosen
  for simplicity given a single trusted automation caller.
- Every write must remember to scope by the resolved user id — there is no framework-level
  tenant guard. Multi-tenancy correctness rests on the repos consistently filtering by owner.
