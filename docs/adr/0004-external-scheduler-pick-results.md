# 0004 — Pick/live notifications run on an outside scheduler (cron-job.org)

**Status:** Accepted

## Context

Pick notifications — win/loss when a game ends, plus live halftime and close-game alerts — come
from polling `POST /api/cron/pick-results`, which detects per-pick events and fires Klaviyo events
(see [`../klaviyo.md`](../klaviyo.md) and [ADR 0003](0003-klaviyo-as-integration-spine.md)). To be
useful, close-game alerts especially, it must run every few minutes during games.

The app is on Vercel's **Hobby** plan, where crons run once a day. Vercel can't run it often
enough. Klaviyo flows can't either: a flow can't poll in a loop, and can't branch on a webhook's
response (checked — the detection has to live in our backend).

## Decision

Drive `pick-results` from an **outside scheduler** — a [cron-job.org](https://cron-job.org) job
that calls `POST /api/cron/pick-results` **every 3 minutes** with
`Authorization: Bearer <CRON_SECRET>`. The other two jobs (`refresh`, `sync-klaviyo`) stay on
Vercel cron; once a day is fine.

The endpoint is safe to poll hard:
- **Self-gating:** returns early when no current-week game has kicked off.
- **Idempotent:** dedups on `(entry, week, event_type)`, so repeated or overlapping runs never
  double-send.
- **Verb:** `POST` (it sends pushes and writes the dedup ledger); `GET` is rejected except for
  `?debug=1`.
- **Checkable:** `GET …?debug=1` returns a read-only report (live state + what it would send), so
  you can check the live logic during a real game without sending.

Rejected: **GitHub Actions** (free, but the schedule self-disables after 60 days of repo quiet,
which would fail silently for a notifier you set once and forget); **Vercel Pro** ($20/mo for
sub-daily crons — too much for a hobby app).

## Consequences

**This is an outside dependency.** Notifications depend on a service outside this repo and outside
Vercel:

- If the job is paused, deleted, or the account lapses, pick notifications **stop, with no error**.
  Final results stop too (they moved off Vercel with everything else).
- The job must be **POST** (a `GET` job returns 405 and never fires).
- **`CRON_SECRET` must match** in three places: Vercel env (for `refresh`/`sync-klaviyo`), the
  cron-job.org header, and `.env.local`. Rotate it without updating cron-job.org and notifications
  break (401).
- The live job: `https://console.cron-job.org/jobs/8566230`.

**Mitigations:** the endpoint is idempotent and self-gating (safe to over-poll, safe to retry), and
`?debug=1` confirms it works without sending. For more reliability or higher volume, the swaps are
Upstash QStash (retries, generous free tier) or Vercel Pro for native crons.
