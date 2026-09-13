import type { Matchup, TeamStrength, MoneylineGame, GameView } from "./types";
import { devigTwoWay } from "./odds";
import { projectWinProb } from "./projection";

export function buildGameViews(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  week: number,
): GameView[] {
  const fpi = new Map(strengths.map((s) => [s.team, s.fpi]));
  const key = (w: number, h: string, a: string) => `${w}:${h}:${a}`;
  const oddsMap = new Map(odds.map((o) => [key(o.week, o.home, o.away), o]));
  const out: GameView[] = [];

  for (const g of schedule) {
    if (g.week !== week) continue;
    const posted = oddsMap.get(key(g.week, g.home, g.away));
    if (posted) {
      const { favProb, dogProb } = devigTwoWay(posted.homeOdds, posted.awayOdds);
      out.push({
        week: g.week, home: g.home, away: g.away, kickoff: g.kickoff,
        homeOdds: posted.homeOdds, awayOdds: posted.awayOdds,
        homeSpread: posted.homeSpread ?? null,
        homeProb: favProb, awayProb: dogProb, source: "odds",
      });
    } else {
      const homeProb = projectWinProb(fpi.get(g.home) ?? 0, fpi.get(g.away) ?? 0, true);
      const awayProb = projectWinProb(fpi.get(g.away) ?? 0, fpi.get(g.home) ?? 0, false);
      out.push({
        week: g.week, home: g.home, away: g.away, kickoff: g.kickoff,
        homeOdds: null, awayOdds: null, homeSpread: null, homeProb, awayProb, source: "fpi",
      });
    }
  }
  return out;
}
