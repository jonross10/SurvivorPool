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

  // Plan each pool independently, then derive each entry's recommendation from its path.
  const recs: Recommendation[] = [];
  const pools = [...new Set(entries.map((e) => e.pool))];
  for (const pool of pools) {
    const poolEntries = entries.filter((e) => e.pool === pool);
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
  return recs;
}
