# 0001 — Everything is a JSON:API route, gated by dual auth

**Status:** Accepted

## Context

The app has two clients: a person in the web UI (a browser session) and the Klaviyo Customer Agent
acting for a user (no browser, no cookie). The agent had to do almost anything the UI can — read
status, run what-ifs, create entries, make picks — without a second, parallel surface built for
automation.

The usual shortcut is to let the UI call privileged server actions that touch the DB, then add a
thin API for machines. That drifts: the two surfaces grow different features, validation, and bugs.

## Decision

Every read and write goes through a JSON:API route under `/api`. The UI has no path of its own —
the dashboard calls the same endpoints as the agent. Only the authentication differs, and one
function resolves it, `resolveActorUserId(req)` (`src/lib/agent-auth.ts`):

1. With a valid Better Auth **session cookie**, the request acts as that user. The session wins;
   any `?userId=` / `?email=` is ignored, so a signed-in user can't act as someone else.
2. Otherwise, with the valid shared **`X-API-Key`**, the request acts as the user named by
   `?userId=` (our id) or `?email=` (mapped to our id). This is the agent path. It works only with
   a valid key, so no one can spoof it.

Responses use the [JSON:API spec](https://jsonapi.org/) (`resource` / `document` / error shapes in
`src/lib/jsonapi.ts`, with a matching client in `jsonapi-client.ts`), so both clients parse one
envelope.

Pages sit behind `src/middleware.ts`, an edge check that sends cookieless visitors to `/signin`.
API routes are left out of that matcher, so the cookieless agent is never redirected; their real
check is the per-request `resolveActorUserId` call.

## Consequences

**Good:**
- One surface. A feature added for the UI is there for the agent too. That's how `get_week_options`
  and `plan_whatif` arrived: extend or add an endpoint, point a tool at it.
- Authorization lives in one function. Routes ask "who is acting?" and get a user id or null.
- Testable. Auth resolution is unit-tested (`tests/lib/agent-auth.test.ts`) apart from routes.

**Costs:**
- One shared `API_KEY` covers the whole agent path. It's a bearer secret that can name any user, so
  it must stay server-side and rotate if it leaks. Per-agent keys or signed per-user tokens would
  be stronger; the shared key is simpler for one trusted caller.
- Every write must scope by the resolved user id. There's no framework tenant guard, so multi-tenant
  safety rests on the repos filtering by owner.
