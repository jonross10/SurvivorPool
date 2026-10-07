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
  // Live state (optional; present once a game is in progress). Used for halftime / close-game
  // notifications. period: 1-4, 5+ = OT. statusName: ESPN status.type.name, e.g.
  // "STATUS_HALFTIME", "STATUS_END_PERIOD", "STATUS_IN_PROGRESS", "STATUS_FINAL".
  period?: number | null;
  clock?: string | null; // displayClock, e.g. "2:14"
  statusName?: string;
}

export type PickOutcome = "won" | "lost" | "tie" | "pending" | "live";

export interface TeamStrength {
  team: TeamAbbr;
  fpi: number;
}

export interface Injury {
  team: TeamAbbr;
  player: string;
  position: string; // QB, RB, WR, TE, …
  status: string; // Out, Doubtful, Questionable, IR, PUP, Sus
  isQB: boolean;
  bodyPart: string | null;
}

/** Notable injuries grouped by team abbreviation. */
export type InjuryMap = Record<TeamAbbr, Injury[]>;

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
  result?: GameResult | null; // final/live score, attached by the matchups route
  homeInjuries?: Injury[]; // notable injuries, attached by the matchups route (upcoming games only)
  awayInjuries?: Injury[];
}

export interface EntrySettings {
  ties_survive?: boolean;   // absent → treated as true
  pool?: string;            // coordination group; absent → "main"
  min_win_chance?: number;  // 0..0.95 safety floor for this entry; absent → 0.6
  pick_due?: { day: number; time: string } | null; // weekly deadline: day 0=Sun..6=Sat, time "HH:MM"
}

export interface Entry {
  id: string;
  name: string;
  settings: EntrySettings;
  ownerId: string;
}
