# 0004 — Pick-result/live notifications run on an external scheduler (cron-job.org)

**Status:** Accepted

## Context

Pick notifications — win/loss when a game goes final, plus live halftime and close-game alerts —
are produced by polling `POST /api/cron/pick-results`, which detects per-pick game events and
fires Klaviyo events (see [`../klaviyo.md`](../klaviyo.md) and
[ADR 0003](0003-klaviyo-as-integration-spine.md)). To be useful, especially the close-game alert,
this needs to run **every few minutes during game windows**.

The app is deployed on Vercel's **Hobby** plan, where scheduled crons can only run **once per
day**. So the notifier cannot be scheduled by Vercel at the cadence it needs. Klaviyo flows can't
fill the gap either: a flow can't poll on a loop, and can't branch on a webhook's response
(verified — the detection has to live in our backend regardless).

## Decision

Drive `pick-results` from an **external scheduler** — a [cron-job.org](https://cron-job.org) job
that hits `POST /api/cron/pick-results` **every 3 minutes**, authenticated with
`Authorization: Bearer <CRON_SECRET>`. The other two jobs (`refresh`, `sync-klaviyo`) stay on
Vercel cron, since once-a-day is fine for them.

The endpoint is built to be polled hard safely:
- **Self-gating:** early-exits when no current-week game has kicked off.
- **Idempotent:** dedups per `(entry, week, event_type)`, so overlapping/retried runs never
  double-send.
- **Verb:** `POST` (it mutates — sends pushes, writes the dedup ledger); `GET` is rejected except
  for `?debug=1`.
- **Validatable:** `GET …?debug=1` returns a read-only dry report (live game state + what it would
  send) so the live halftime/close logic can be checked during a real game without firing.

Rejected alternatives: **GitHub Actions** scheduled workflows (free, but self-disable after 60
days of repo inactivity — a silent-failure trap for a set-and-forget notifier); **Vercel Pro**
($20/mo for native sub-daily crons — overkill for a hobby app).

## Consequences

**This is an external operational dependency.** Notifications depend on a service *outside this
repo and outside Vercel*:

- If the cron-job.org job is **paused, deleted, or the account lapses**, pick notifications
  **silently stop** — nothing in the app errors. Final results would also stop (they moved off
  Vercel with everything else).
- The job must use **POST** (a `GET` job returns 405 and never fires).
- **`CRON_SECRET` must stay in sync** in three places: Vercel env (for `refresh`/`sync-klaviyo`),
  the cron-job.org `Authorization` header, and `.env.local`. Rotating it without updating
  cron-job.org silently breaks notifications (401s).
- The current job lives at `https://console.cron-job.org/jobs/8566230`.

**Mitigations:** the endpoint is idempotent and self-gating (safe to over-poll, safe to retry),
and `?debug=1` gives a non-destructive way to confirm it's working. If this ever needs to be
bulletproof or higher-volume, the equivalents are Upstash QStash (retries, generous free tier) or
upgrading to Vercel Pro for native crons.
