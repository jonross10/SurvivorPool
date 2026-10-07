import type { Matchup, TeamStrength, MoneylineGame, WinProb, TeamAbbr } from "./types";
import { devigTwoWay } from "./odds";
import { projectWinProb } from "./projection";

export function buildWinProbs(
  schedule: Matchup[],
  strengths: TeamStrength[],
  odds: MoneylineGame[],
  currentWeek: number,
  usedTeams: Set<TeamAbbr>,
  // When given, drop games that have already kicked off: you can't newly pick a started game,
  // and once it's live the odds track the score (a leading team shows an inflated win prob).
  // Omit it for past-week backfill, where showing already-played games is the point.
  now?: Date,
): WinProb[] {
  const fpi = new Map(strengths.map((s) => [s.team, s.fpi]));
  const oddsKey = (w: number, h: TeamAbbr, a: TeamAbbr) => `${w}:${h}:${a}`;
  const oddsMap = new Map(odds.map((o) => [oddsKey(o.week, o.home, o.away), o]));
  const out: WinProb[] = [];

  for (const g of schedule) {
    if (g.week < currentWeek) continue;
    if (now && new Date(g.kickoff) <= now) continue; // already kicked off — not pickable

    const posted = oddsMap.get(oddsKey(g.week, g.home, g.away));
    for (const teamIsHome of [true, false]) {
      const team = teamIsHome ? g.home : g.away;
      const opp = teamIsHome ? g.away : g.home;
      if (usedTeams.has(team)) continue;

      let prob: number;
      let source: WinProb["source"];
      if (posted) {
        const { favProb, dogProb } = devigTwoWay(posted.homeOdds, posted.awayOdds);
        prob = teamIsHome ? favProb : dogProb;
        source = "odds";
      } else {
        prob = projectWinProb(fpi.get(team) ?? 0, fpi.get(opp) ?? 0, teamIsHome);
        source = "fpi";
      }
      out.push({ week: g.week, team, opponent: opp, home: teamIsHome, prob, source });
    }
  }
  return out;
}
