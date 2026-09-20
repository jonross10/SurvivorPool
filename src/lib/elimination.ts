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

export function outcomeForWeek(
  pick: TeamAbbr,
  result: GameResult | undefined,
  tiesSurvive: boolean,
): PickOutcome {
  if (!result) return "pending";
  if (result.inProgress && !result.completed) return "live";
  if (!result.completed) return "pending";
  if (result.winner === pick) return "won";
  if (result.winner === null) return tiesSurvive ? "tie" : "lost"; // completed tie
  return "lost";
}

export interface EntryStatus {
  eliminated: boolean;
  eliminatedWeek: number | null;
  byWeek: Record<number, PickOutcome>;
}

/**
 * Derive elimination by walking picks in week order. Each week resolves to an
 * override outcome when present, otherwise the auto outcome. The entry is
 * eliminated at the first week that resolves to a loss.
 */
export function deriveEntryStatus(
  picksByWeek: Record<number, TeamAbbr>,
  results: GameResult[],
  overrides: Record<number, "survived" | "out" | "revived">,
  tiesSurvive: boolean,
): EntryStatus {
  const byWeek: Record<number, PickOutcome> = {};
  let eliminated = false;
  let eliminatedWeek: number | null = null;

  const weeks = Object.keys(picksByWeek).map(Number).sort((a, b) => a - b);
  for (const w of weeks) {
    const pick = picksByWeek[w];
    const result = results.find((r) => r.week === w && (r.home === pick || r.away === pick));
    const ov = overrides[w];
    let outcome: PickOutcome;
    // "revived" = the entry lost but bought back in: keep the loss visible in the
    // timeline, but don't let it eliminate them.
    if (ov === "out") outcome = "lost";
    else if (ov === "revived") outcome = "lost";
    else if (ov === "survived") outcome = "won";
    else outcome = outcomeForWeek(pick, result, tiesSurvive);

    byWeek[w] = outcome;
    if (!eliminated && outcome === "lost" && ov !== "revived") {
      eliminated = true;
      eliminatedWeek = w;
    }
  }
  return { eliminated, eliminatedWeek, byWeek };
}
