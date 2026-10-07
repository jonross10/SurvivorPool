# 0002 — Pick engine maximizes the season path, not the greedy weekly best

**Status:** Accepted

## Context

A survivor entry picks one team a week, uses each team once, and is out on one loss. The naive move
is **greedy**: each week, pick the available team most likely to win. Greedy is simple but weak. It
spends your best team — a big favorite — on an easy week a weaker team would also win, and leaves
you worse options later. The teams you don't spend have future value.

We want picks that plan the rest of the season: hold strong teams for the weeks that need them, and
show the user why.

## Decision

Model the rest of the season as a **max-weight assignment**: weeks on one side, unused teams on the
other, edge weight = that team's win probability that week.

- `optimalPath` (`pick-engine.ts`) builds a (weeks × teams) matrix of `log(prob)` and runs
  `maxWeightAssignment` (`matching.ts`, Hungarian-style). Summing logs maximizes the **product** of
  win probabilities — the chance of surviving the whole path. One team per week, each team once,
  comes from the assignment constraints.
- Win probabilities come from two sources (`winprob-matrix.ts`): de-vigged moneylines for this week
  (`odds.ts`), and FPI projections for later weeks (`projection.ts`).
- `recommendFromPath` turns the path into this week's pick, applies the per-entry **safety floor**
  (if the best pick is below the floor, swap to the safest team above it), and writes the reason
  plus the greedy alternative.
- `portfolio.ts` + `recommendations.ts` plan a whole **pool** together, so a user's entries
  diversify instead of using the same team the same week. Out entries are excluded so they don't
  hold teams.

## Consequences

**Good:**
- Picks account for future weeks, which is the point of survivor.
- The projected path is reused everywhere — the projection page, the Klaviyo Entry object, and the
  assistant's `plan_whatif` (which re-runs the assignment with a hypothetical pick added).
- Working in log-space keeps the math stable and the goal — maximize survival — explicit.

**Costs:**
- The projection is only as good as its inputs. FPI for far weeks is rough, so the path shifts week
  to week as odds settle. Expected, but the path is guidance, not a commitment.
- The assignment finds the single most-likely path. It doesn't optimize over the full spread of
  outcomes (no hedging of correlated upsets). Good enough here, and far better than greedy, without
  a full stochastic optimizer.
- A hard safety floor can override the optimal pick. That's on purpose — users avoid early
  coin-flips — but the pick isn't always the raw argmax.
