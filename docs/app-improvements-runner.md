# App-improvements runner (spec)

**Status:** Spec — the deploy notifier is built; the runner is not yet.

A workflow to request app changes from the phone chat and have a laptop agent implement them,
test-gate them, push to master, and notify the phone. Requested in the 2026-10-15 chat.

## Shape

```
phone chat ──"app improvement: <ask>"──▶ Klaviyo conversation
                                              │ (gated to the maintainer's user id)
laptop runner (every few min) ──reads new requests──▶ implement with Claude Code
                                              │
                        ┌─────────────────────┴─────────────────────┐
                   tests pass + not risky                      risky OR tests fail
                        │                                             │
             commit → push master → notify phone        push a question → wait for a chat reply
```

## Decisions (agreed)

- **Trigger:** a chat message that starts with a set phrase, e.g. `app improvement:`. The phrase is
  the signal; the real gate is the **user id**.
- **Lockdown:** only act on requests from the maintainer's exact user id
  (`kMXnOE60Vub8qbg267cjnqujLVdKqCEO`). Hacky but fine for a single-user app.
- **Execution — option #2, tests-gated auto-push:**
  - Implement the change.
  - Run `npx tsc --noEmit` and `npm test`. **Only push to master if both pass.**
  - Classify **risky** requests and pause instead of auto-pushing: anything touching auth, DB
    schema or deletes, secrets, payments/billing, or with vague/ambiguous scope, plus unusually
    large diffs.
  - On a risky request or a test failure, **push a notification with a question** and wait for the
    maintainer to reply in chat before continuing.
- **Deploy notification:** on every push to master, send a phone push with a title + a one-line
  summary per commit. **Built** — `scripts/notify-deploy.ts` (`npm run notify-deploy`), posts to
  `/api/push/send`.

## To build

1. **Capture reader.** Poll `GET /customer-agent-conversations` + the messages endpoint for new
   messages from the maintainer's user id starting with the phrase, since a stored watermark
   (last-processed message id / timestamp). (This is the same Klaviyo read used all session.)
   - Decide: reuse the survivor agent conversation with a prefix, or a separate conversation /
     channel so the survivor skill doesn't try to answer it.
2. **Runner loop.** A scheduled job (launchd/cron, or Claude Code's schedule/loop) that, per new
   request: implements → `tsc` + `test` → risky/clean branch → push + `notify-deploy` OR
   question-push + wait.
3. **Risky classifier.** Start with a path/keyword allowlist-deny (auth.ts, schema.sql, *-repo on
   delete, env/secrets, push/billing) + a diff-size threshold; err toward asking.
4. **Reply channel for questions.** The question push links back to chat; the runner reads the
   maintainer's next message as the answer (same capture reader).
5. **State + idempotency.** Persist the watermark and per-request status so a crash or overlapping
   run never double-implements or double-pushes.

## Risks / open questions

- **Auto-push of AI changes to production** is the core risk. #2's test gate + risky-pause is the
  guardrail; consider also: require a clean `git status` before starting, branch-per-change with a
  fast-forward merge, and a hard stop if the diff exceeds N files/lines.
- Where does the runner run, and how is it kept alive (laptop asleep = no runner)?
- Should it open a draft PR instead of pushing, for an audit trail? (Trade-off vs the "auto" goal.)
- Secrets: the runner needs `API_KEY` + repo push rights; keep them in `.env.local` / the keychain,
  never in the request path.
