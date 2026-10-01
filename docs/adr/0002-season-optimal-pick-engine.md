# 0002 — Pick engine maximizes the season path, not the greedy weekly best

**Status:** Accepted

## Context

A survivor entry picks one team per week, can use each team at most once, and is out on a single
loss. The naive strategy is **greedy**: each week pick the available team most likely to win.
Greedy is simple but strategically weak — it happily spends your strongest team (say a huge
favorite) on an easy week where a middling team would also have won, leaving you with worse
options later. The teams you *don't* spend are a resource with future value.

We want recommendations that plan the whole remaining season: reserve strong teams for the weeks
that need them, and tell the user *why* a given pick was made.

## Decision

Model the remaining season as a **max-weight bipartite assignment**: weeks on one side, still-
available teams on the other, edge weight = win probability of that team in that week.

- `optimalPath` (`pick-engine.ts`) builds a (weeks × teams) matrix of `log(prob)` and runs
  `maxWeightAssignment` (`matching.ts`, Hungarian-style). Summing logs = maximizing the
  **product** of win probabilities across the season, i.e. the probability of surviving the whole
  path. One team per week, each team once, falls directly out of the assignment constraints.
- Win probabilities come from two sources stitched together (`winprob-matrix.ts`): de-vigged
  moneylines for the current week (`odds.ts`), FPI-based logistic projections for future weeks
  (`projection.ts`).
- `recommendFromPath` turns the planned path into a current-week recommendation, applies a
  per-entry **safety floor** (if the optimal current pick is below the floor, swap to the safest
  team that clears it), and emits reasoning plus the greedy alternative for transparency.
- `portfolio.ts` + `recommendations.ts` plan an entire **pool** together so a user's multiple
  entries diversify instead of riding the same team into the same week; eliminated entries are
  excluded so they don't reserve teams.

## Consequences

**Good:**
- Recommendations account for future weeks, which is the whole point of survivor strategy.
- The projected path is a first-class artifact reused everywhere — the projection page, the
  Klaviyo Entry object, and the assistant's `plan_whatif` (which just re-runs the assignment with
  a hypothetical pick merged in).
- Working in log-space makes the objective numerically stable and the "maximize survival
  probability" intent explicit.

**Costs / trade-offs:**
- The projection is only as good as its inputs. FPI for far-future weeks is a coarse estimate, so
  the path shifts week to week as odds firm up — expected, but it means the path is guidance, not
  a commitment.
- Assignment optimizes the single most-likely path; it does not maximize over the full
  distribution of outcomes (e.g. hedging correlated upsets). Good enough for the domain, and far
  better than greedy, without the complexity of a full stochastic optimizer.
- A hard safety floor can override the mathematically optimal pick. That's intentional (users
  want to avoid coin-flips early) but means the recommendation isn't always the raw argmax.
