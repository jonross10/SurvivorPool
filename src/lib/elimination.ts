import type { GameResult, PickOutcome, TeamAbbr } from "./types";

export interface PickResultView {
  week: number;
  team: TeamAbbr;
  outcome: PickOutcome;
  teamScore: number | null;
  oppScore: number | null;
  opponent: TeamAbbr | null;
  statusDetail: string;
}

/** Per-week view of each pick's score, oriented from the picked team's side. */
export function pickResultViews(
  picksByWeek: Record<number, TeamAbbr>,
  results: GameResult[],
  byWeek: Record<number, PickOutcome>,
): Record<number, PickResultView> {
  const out: Record<number, PickResultView> = {};
  for (const [wStr, team] of Object.entries(picksByWeek)) {
    const week = Number(wStr);
    const r = results.find((g) => g.week === week && (g.home === team || g.away === team));
    let teamScore: number | null = null;
    let oppScore: number | null = null;
    let opponent: TeamAbbr | null = null;
    if (r) {
      const isHome = r.home === team;
      teamScore = isHome ? r.homeScore : r.awayScore;
      oppScore = isHome ? r.awayScore : r.homeScore;
      opponent = isHome ? r.away : r.home;
    }
    out[week] = {
      week, team, outcome: byWeek[week] ?? "pending",
      teamScore, oppScore, opponent, statusDetail: r?.statusDetail ?? "",
    };
  }
  return out;
}
