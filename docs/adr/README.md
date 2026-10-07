# Architecture Decision Records

Short records of decisions that aren't obvious from the code. Each gives the context, the decision,
and the trade-offs, so a later reader knows *why*, not just *what*.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-jsonapi-everywhere-dual-auth.md) | Everything is a JSON:API route, gated by dual auth (session **or** agent API key) | Accepted |
| [0002](0002-season-optimal-pick-engine.md) | Pick engine maximizes the season path (assignment), not the greedy weekly best | Accepted |
| [0003](0003-klaviyo-as-integration-spine.md) | Klaviyo is the messaging/integration layer (agent, objects, flows, push) | Accepted |
| [0004](0004-external-scheduler-pick-results.md) | Pick/live notifications run on an external scheduler (cron-job.org), since Vercel Hobby crons are daily-only | Accepted |

New ADRs: copy the shape of an existing one, give it the next number, and add a row here.
