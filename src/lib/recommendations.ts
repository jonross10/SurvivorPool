import type { Matchup, TeamStrength, MoneylineGame, Recommendation, TeamAbbr } from "./types";
import { buildWinProbs } from "./winprob-matrix";
import { recommendFromPath } from "./pick-engine";
import { planPortfolio, type EntryPlanInput } from "./portfolio";
import { currentWeek } from "./week";

export interface EntryPlanContext {
  name: string;
  pool: string;
  picksByWeek: Record<number, string>;
  safetyFloor: number; // per-entry min win chance for the current-week pick
  eliminated?: boolean;
}

export function buildRecommendations(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  entries: EntryPlanContext[],
  now: Date,
): Recommendation[] {
  const week = currentWeek(schedule, now);
  const floorByEntry = new Map(entries.map((e) => [e.name, e.safetyFloor]));

  // Per-entry win probs (exclude used teams) and locked (already-picked, current+future) weeks.
  const winProbsByEntry = new Map<string, ReturnType<typeof buildWinProbs>>();
  const lockedByEntry = new Map<string, Record<number, string>>();
  for (const e of entries) {
    const used = new Set<TeamAbbr>(Object.values(e.picksByWeek));
    winProbsByEntry.set(e.name, buildWinProbs(schedule, strengths, odds, week, used));
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

    // Current-week teams already spoken for in this pool (locked picks + each plan's
    // optimal current-week team). Passed to the floor swap so it can't collide.
    const taken = new Set<TeamAbbr>();
    for (const e of poolEntries) { const t = lockedByEntry.get(e.name)![week]; if (t) taken.add(t); }
    for (const plan of plans) { const cur = plan.path.find((p) => p.week === week); if (cur) taken.add(cur.team); }

    for (const plan of plans) {
      const cur = plan.path.find((p) => p.week === week);
      const exclude = new Set(taken);
      if (cur) exclude.delete(cur.team); // this entry may keep its own optimal pick
      const rec = recommendFromPath(plan.entry, week, plan.path, winProbsByEntry.get(plan.entry)!, { safetyFloor: floorByEntry.get(plan.entry) ?? 0.6 }, exclude);
      if (cur) taken.delete(cur.team);
      if (rec.pick) taken.add(rec.pick);
      recs.push(rec);
    }
  }
  // Eliminated entries still need a (stub) rec so the UI can render their card/row.
  for (const e of entries.filter((x) => x.eliminated)) {
    recs.push({ entry: e.name, week, pick: null, prob: 0, reasoning: "Eliminated.", greedyAlt: null, projectedPath: [] });
  }
  return recs;
}
