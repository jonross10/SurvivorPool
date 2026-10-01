# 0003 — Klaviyo is the messaging and integration spine

**Status:** Accepted

## Context

The app needs a conversational assistant, transactional email (passwordless sign-in links),
push/notification delivery, and scheduled result alerts. The obvious build would be: an LLM
integration for chat, an email provider (e.g. SES/SendGrid) for mail, a push service, and glue
code tying them to the data model.

This project is also, deliberately, a showcase of what can be built *on Klaviyo* — its Customer
Agent, Custom Objects, Flows, and events — so leaning on that platform is a goal, not just a
convenience.

## Decision

Use **Klaviyo as the spine** for everything messaging-related, and mirror the app's domain state
into Klaviyo so flows and the agent can act on it:

- **Assistant:** the in-app chat is a Klaviyo **Customer Agent** conversation with a custom
  *survivor-strategy* skill. The agent's tools call back into our JSON:API routes (see
  [ADR 0001](0001-jsonapi-everywhere-dual-auth.md)), so the agent gets real, live data and can
  take real actions.
- **State mirror:** **Custom Objects** (Entry + Pick) hold a copy of every entry and pick, synced
  from the same computation the dashboard uses (`klaviyo-objects.ts`). Flows and messages can
  then reference entry status, picks, and deadlines directly.
- **Notifications:** app-tracked **events** (`Magic Link Requested`, `Signed Up`,
  `Push Enabled/Disabled`, `Pick Result`) trigger **Flows** built in Klaviyo. Magic-link email,
  reminders, and result alerts are all flows, not app code.
- **Push:** web push is delivered via a Klaviyo flow **webhook** that posts to `/api/push/send`.
- **Identity:** `external_id = our user.id` links profile ↔ user, established at account creation.

See [`../klaviyo.md`](../klaviyo.md) for the concrete wiring.

## Consequences

**Good:**
- No bespoke email/push/notification service to run; message content and scheduling logic live in
  Klaviyo where they can change without a deploy.
- The agent operates on live app state and shares the UI's capability surface, so it stays in
  sync with the product automatically.
- Demonstrates the platform end-to-end, which is a project goal.

**Costs / trade-offs:**
- Hard dependency on Klaviyo availability for sign-in email and notifications. Mitigated by making
  every sync/track call **best-effort and non-blocking** (background fire-and-forget; failures are
  logged, never thrown into the user's request) — a Klaviyo outage degrades messaging but doesn't
  break the app.
- State is duplicated (Postgres is the source of truth; Klaviyo is a mirror), so sync drift is
  possible. Mitigated by stable record ids (upsert, not duplicate) and a nightly `sync-klaviyo`
  reconcile cron.
- The live Klaviyo account is the system of record for these resources, but their definitions
  are codified in `scripts/provision-agent.ts` (agent secret/tools/knowledge/skill, the
  magic-link email template, and all three notification flows), so they're reproducible and
  version-controlled rather than click-configured. The one gap: Klaviyo flow *definitions* can't
  be PATCHed via API, so changing a flow means recreating it — the script creates, it doesn't
  reconcile edits in place.
- Uses beta Klaviyo APIs (Customer Agent, Custom Objects) pinned to specific revisions in
  `klaviyo-http.ts`; revisions may change under us.
