import type { Matchup, TeamStrength, MoneylineGame, Recommendation, TeamAbbr } from "./types";
import { buildWinProbs } from "./winprob-matrix";
import { recommend } from "./pick-engine";
import { currentWeek } from "./week";

export function buildRecommendations(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  picksByEntry: Record<string, Set<TeamAbbr>>,
  now: Date,
  safetyFloor: number,
): Recommendation[] {
  const week = currentWeek(schedule, now);
  const recs: Recommendation[] = [];
  for (const [entry, used] of Object.entries(picksByEntry)) {
    const wps = buildWinProbs(schedule, strengths, odds, week, used);
    recs.push(recommend(entry, week, wps, { safetyFloor }));
  }
  return recs;
}
