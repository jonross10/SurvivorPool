import type { Matchup, TeamStrength, MoneylineGame, Recommendation, TeamAbbr } from "./types";
import { buildWinProbs } from "./winprob-matrix";
import { recommendFromPath } from "./pick-engine";
import { planPortfolio, type EntryPlanInput } from "./portfolio";
import { currentWeek } from "./week";

export interface EntryPlanContext {
  name: string;
  pool: string;
  used: Set<TeamAbbr>;
  picksByWeek: Record<number, string>;
  eliminated?: boolean;
}

export function buildRecommendations(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  entries: EntryPlanContext[],
  now: Date,
  safetyFloor: number,
): Recommendation[] {
  const week = currentWeek(schedule, now);

  // Per-entry win probs (exclude used teams) and locked (already-picked, current+future) weeks.
  const winProbsByEntry = new Map<string, ReturnType<typeof buildWinProbs>>();
  const lockedByEntry = new Map<string, Record<number, string>>();
  for (const e of entries) {
    winProbsByEntry.set(e.name, buildWinProbs(schedule, strengths, odds, week, e.used));
    lockedByEntry.set(
      e.name,
      Object.fromEntries(
        Object.entries(e.picksByWeek)
          .map(([w, t]) => [Number(w), t] as const)
          .filter(([w]) => w >= week),
      ),
    );
  }

  // Plan each pool independently over its ALIVE entries only (eliminated entries
  // aren't competing, so they must not occupy teams in the diversification).
  const recs: Recommendation[] = [];
  const alive = entries.filter((e) => !e.eliminated);
  const pools = [...new Set(alive.map((e) => e.pool))];
  for (const pool of pools) {
    const poolEntries = alive.filter((e) => e.pool === pool);
    const inputs: EntryPlanInput[] = poolEntries.map((e) => ({
      entry: e.name,
      winProbs: winProbsByEntry.get(e.name)!,
      lockedByWeek: lockedByEntry.get(e.name)!,
    }));
    const plans = planPortfolio(inputs);
    for (const plan of plans) {
      recs.push(recommendFromPath(plan.entry, week, plan.path, winProbsByEntry.get(plan.entry)!, { safetyFloor }));
    }
  }
  // Eliminated entries still need a (stub) rec so the UI can render their card/row.
  for (const e of entries.filter((x) => x.eliminated)) {
    recs.push({ entry: e.name, week, pick: null, prob: 0, reasoning: "Eliminated.", greedyAlt: null, projectedPath: [] });
  }
  return recs;
}
