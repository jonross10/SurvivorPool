export type TeamAbbr = string; // e.g. "BUF"

export interface Matchup {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string; // ISO
}

export interface GameResult {
  week: number;
  home: TeamAbbr;
  away: TeamAbbr;
  kickoff: string; // ISO
  homeScore: number | null; // null until the game has started
  awayScore: number | null;
  winner: TeamAbbr | null; // null = tie (if completed) or not yet decided
  completed: boolean; // status.type.completed
  inProgress: boolean; // status.type.state === "in"
  statusDetail: string; // e.g. "Final", "Q3 5:22", "Sun 1:00 PM"
}

export type PickOutcome = "won" | "lost" | "tie" | "pending" | "live";

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

export interface EntrySettings {
  ties_survive?: boolean; // absent → treated as true
}

export interface Entry {
  id: string;
  name: string;
  settings: EntrySettings;
}
