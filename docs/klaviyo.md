# Klaviyo integration

Klaviyo is the app's messaging and conversational layer. Four things run through it:

1. **The strategy assistant** — an in-app chat backed by the Klaviyo Customer Agent.
2. **Custom Objects sync** — every entry and pick mirrored into Klaviyo as shared objects.
3. **Notification flows** — sign-in links, push enable/disable, and pick-result alerts.
4. **Web push** — browser notifications delivered via a Klaviyo flow webhook.

For *why* Klaviyo is the integration spine rather than a bespoke notification service, see
[ADR 0003](adr/0003-klaviyo-as-integration-spine.md).

## Code layout

| File | Responsibility |
| --- | --- |
| `src/lib/klaviyo-http.ts` | Base URL, API revisions (`2026-07-15` stable, `2026-07-15.pre` beta), and `klaviyoHeaders(revision)`. |
| `src/lib/klaviyo.ts` | Events/profiles (`trackEvent`, `upsertProfile`, `linkProfileExternalId`), magic-link email, the Customer Agent conversation/response calls, and `frameForRouting`. |
| `src/lib/klaviyo-objects.ts` | Custom Objects sync: map entries/picks to records, push via bulk jobs, and delete records. |
| `scripts/provision-agent.ts` | One-shot provisioner for the agent's tools + skill. |

## Identity model

The link between an app user and a Klaviyo profile is **`external_id` = our `user.id`**. On
account creation, a Better Auth `databaseHooks.user.create.after` hook calls
`linkProfileExternalId` so the profile exists and is linked immediately (best-effort; never
blocks sign-up). Events then target the profile by `external_id` or `email`.

Agent tool calls pass the acting user's id explicitly (via the message framing, below) rather
than relying on `{{ person.external_id }}`, which renders empty in some webhook contexts.

## 1. The strategy assistant (Customer Agent)

The in-app chat (`/assistant`, `src/components/AssistantChat.tsx`) posts to `/api/chat`, which
creates/continues a **Customer Agent conversation** tied to the signed-in user's profile and
returns the agent's replies.

**Routing + auth framing.** `frameForRouting(message, userId)` prefixes every outgoing message
with `(NFL survivor pool · user=<id>)`. This does two jobs: it steers Klaviyo's skill router to
our *survivor-strategy* skill (not the prebuilt General Q&A), and it carries the server-verified
user id for the agent to pass to its tools. The id is injected server-side, so the client can't
spoof it, and we pass the id, not the email (no PII in the transcript).

**Tools.** The agent reaches back into the app through the same JSON:API routes the UI uses,
authenticating with the shared `X-API-Key` and naming the user via `?userId=`. Provisioned by
`scripts/provision-agent.ts`:

| Tool | Endpoint | Use |
| --- | --- | --- |
| `get_entries` | `GET /api/recommendations`-style status | Each entry's status, current pick, used teams, projected path. |
| `get_matchups` | `GET /api/matchups` | A week's games with odds/win %. |
| `get_week_options` | `GET /api/grid?filter[entry]=&filter[week]=` | Best **available** teams + win % for an entry in **any** week. |
| `plan_whatif` | `POST /api/simulate-plan` | Rebuild the projected path for a hypothetical pick without locking it. |
| `make_pick` | `POST /api/picks` | Record a pick (after explicit user confirmation in chat). |
| `create_entry` / `update_entry` / `delete_entry` | `/api/entries[/id]` | Entry management. |

The skill instructions tell the agent to treat the user as already authenticated, to extract and
pass the `userId` on every call, and to **verify a tool succeeded before claiming an action is
done**. Re-running `provision-agent.ts` is the source of truth; live edits (new tools, skill
instruction changes) are applied against the beta revision.

## 2. Custom Objects sync (`klaviyo-objects.ts`)

Two shared object types — **Entry** and **Pick** — mirror the app's state into Klaviyo so flows
and messages can reference it. `syncOwner(ownerId)` reuses the exact same status /
recommendation / game-view computation the dashboard uses, so records reflect what the app shows:
the Entry record carries alive/eliminated state, current + suggested pick, used teams, and the
projected path; each Pick record carries the matchup, win prob, and result.

- Records push through **bulk create jobs** (batches of 500) against a shared data source.
- Record ids are stable (`<entryId>` for entries, `<entryId>:<week>` for picks) so re-syncing
  upserts rather than duplicating.
- Writes that mutate entries/picks call `syncOwnerInBackground` / `deleteEntryRecordsInBackground`
  — fire-and-forget, so a slow or failing Klaviyo call never blocks or breaks the user's request.
- The nightly `sync-klaviyo` cron calls `syncAllOwners` to reconcile any drift.

## 3. Notification flows

Events tracked from the app trigger Klaviyo flows (built in Klaviyo, not in this repo). Metric
names live in `klaviyo.ts`:

| Metric | Fired when | Flow does |
| --- | --- | --- |
| `Magic Link Requested` | User requests a passwordless link | Emails `{{ event.magic_link_url }}` (link valid 15 min). |
| `Signed Up` | Account created | Welcome / onboarding. |
| `Push Enabled` / `Push Disabled` | User toggles web push | Bookkeeping / confirmation. |
| `Pick Result` | A picked game goes final (see below) | Notifies the owner their entry survived/lost. |

A date-triggered reminder flow uses the Entry object's `pick_due` (a recurring weekly deadline
resolved to a concrete UTC timestamp by `weeklyDeadlineISO`).

## 4. Web push

Browser push uses VAPID (`web-push`) with a service worker (`public/sw.js`). `/api/push/subscribe`
stores a subscription per device; a Klaviyo flow webhook posts to `/api/push/send`, which looks up
the user's subscriptions (by `userId`/`email`, trimmed) and delivers the notification. Push-enabled
profiles are filtered in-flow on a `push_enabled` profile property.

## Cron schedule (`vercel.json`, UTC)

| Cron | Schedule (UTC) | Does |
| --- | --- | --- |
| `refresh` | daily 16:00 | Ingest schedule / FPI / odds into the cache. |
| `sync-klaviyo` | daily 16:30 | Reconcile all owners' Custom Object records. |
| `pick-results` (6 slots) | `thu`, `sun-afternoon`, `sun-evening`, `sun-night`, `mon-night`, `tue-am` | After each game window, detect newly-final picks and fire `Pick Result` events, deduped via `pick_result_notifications`. |

Vercel crons are UTC-only, so the slots are chosen to land just after the Thursday / Sunday /
Monday / Tuesday-morning NFL game windows in US Eastern.
