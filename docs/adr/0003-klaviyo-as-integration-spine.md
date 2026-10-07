# 0003 — Klaviyo is the messaging and integration layer

**Status:** Accepted

## Context

The app needs a chat assistant, sign-in email, push delivery, and scheduled result alerts. The
obvious build is an LLM for chat, an email provider (SES/SendGrid), a push service, and code to
connect them to the data model.

This project is also a showcase of what you can build *on Klaviyo* — its Customer Agent, Custom
Objects, Flows, and events — so using that platform heavily is a goal, not just a convenience.

## Decision

Use **Klaviyo** for everything the app sends, and copy the app's state into Klaviyo so flows and
the agent can act on it:

- **Assistant:** the chat is a Klaviyo **Customer Agent** conversation with a custom
  *survivor-strategy* skill. Its tools call our JSON:API routes
  ([ADR 0001](0001-jsonapi-everywhere-dual-auth.md)), so it works on live data and takes real
  actions.
- **State copy:** **Custom Objects** (Entry + Pick) hold a copy of every entry and pick, synced
  from the same computation the dashboard uses (`klaviyo-objects.ts`). Flows and messages read
  entry status, picks, and deadlines straight from them.
- **Notifications:** app events (`Magic Link Requested`, `Signed Up`, `Push Enabled/Disabled`,
  `Pick Result`) trigger **Flows**. Sign-in email, reminders, and result alerts are flows, not app
  code.
- **Push:** a flow **webhook** posts to `/api/push/send`.
- **Identity:** `external_id = our user.id` links profile to user at account creation.

See [`../klaviyo.md`](../klaviyo.md) for the wiring.

## Consequences

**Good:**
- No separate email, push, or notification service to run. Message content and timing live in
  Klaviyo and change without a deploy.
- The agent works on live state and shares the UI's endpoints, so it stays in sync with the product.
- It shows the platform end to end, which is a project goal.

**Costs:**
- Sign-in email and notifications depend on Klaviyo being up. Every sync and track call is
  best-effort and non-blocking (background, logged on failure, never thrown into the request), so a
  Klaviyo outage degrades messaging but doesn't break the app.
- State is in two places (Postgres is the source of truth; Klaviyo is a copy), so drift is possible.
  Stable record ids (update, don't duplicate) and the nightly `sync-klaviyo` cron keep it in line.
- `scripts/provision-agent.ts` codifies these resources (agent secret/tools/knowledge/skill, the
  email template, all three flows), so they're reproducible and in version control, not clicked
  together. One gap: Klaviyo can't PATCH a flow definition, so changing a flow means recreating it —
  the script creates, it doesn't reconcile edits.
- Uses beta Klaviyo APIs (Customer Agent, Custom Objects) pinned to revisions in `klaviyo-http.ts`.
  Revisions can change under us.
