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
