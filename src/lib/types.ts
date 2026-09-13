export type TeamAbbr = string; // e.g. "BUF"

export interface Matchup {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string; // ISO
}

export interface TeamStrength {
  team: TeamAbbr;
  fpi: number;
}

export interface MoneylineGame {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  homeOdds: number; // American odds, e.g. -200
  awayOdds: number;
  homeSpread?: number | null; // consensus point spread for the home team (negative = favored)
}

export interface WinProb {
  week: number;
  team: TeamAbbr;
  opponent: TeamAbbr;
  home: boolean;
  prob: number; // 0..1
  source: "odds" | "fpi";
}

export interface PathEntry {
  week: number;
  team: TeamAbbr;
  prob: number;
}

export interface Recommendation {
  entry: string;
  week: number;
  pick: TeamAbbr | null;
  prob: number;
  reasoning: string;
  greedyAlt: { team: TeamAbbr; prob: number } | null;
  projectedPath: PathEntry[];
}

export interface GameView {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string;
  homeOdds: number | null; // consensus American line, null when unposted (FPI source)
  awayOdds: number | null;
  homeSpread: number | null; // consensus spread for the home team (negative = favored)
  homeProb: number;
  awayProb: number;
  source: "odds" | "fpi";
}
