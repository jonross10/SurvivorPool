import type { GameResult, TeamAbbr } from "./types";

/** Notification events we can fire for a picked game, in priority order. */
export type PickEventType = "final" | "halftime" | "close";

export interface DetectedEvent {
  type: PickEventType;
  outcome?: "won" | "lost" | "tie"; // only for "final"
}

/** Whether an event type is a win/loss ("final") vs a live game update (halftime/close). */
export function isLiveEvent(type: PickEventType): boolean {
  return type !== "final";
}

/** Parse ESPN's "M:SS" display clock into seconds remaining; null if unparseable. */
export function clockToSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = /^(\d+):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

const CLOSE_MARGIN = 8; // one score
const CLOSE_SECONDS = 5 * 60; // final five minutes

/**
 * Which notify-able events currently hold for a picked game, from the picked team's POV.
 * At most one is returned in practice (a game is final, at half, in a close Q4, or none of these).
 * `final` takes precedence so a game that just ended isn't also reported as "close".
 */
export function detectEvents(r: GameResult, team: TeamAbbr): DetectedEvent[] {
  if (r.completed) {
    const outcome: DetectedEvent["outcome"] =
      r.winner === null ? "tie" : r.winner === team ? "won" : "lost";
    return [{ type: "final", outcome }];
  }
  if (!r.inProgress) return []; // pre-game

  const events: DetectedEvent[] = [];
  const atHalf = r.statusName === "STATUS_HALFTIME" || /half/i.test(r.statusDetail ?? "");
  if (atHalf) events.push({ type: "halftime" });

  const secs = clockToSeconds(r.clock);
  const period = r.period ?? 0;
  const margin =
    r.homeScore != null && r.awayScore != null ? Math.abs(r.homeScore - r.awayScore) : null;
  if (!atHalf && period >= 4 && secs != null && secs <= CLOSE_SECONDS && margin != null && margin <= CLOSE_MARGIN) {
    events.push({ type: "close" });
  }
  return events;
}

/** The picked team's score and its opponent's score/abbr for a game. */
function sides(r: GameResult, team: TeamAbbr): { teamScore: number | null; oppScore: number | null; opp: TeamAbbr } {
  const isHome = r.home === team;
  return {
    teamScore: isHome ? r.homeScore : r.awayScore,
    oppScore: isHome ? r.awayScore : r.homeScore,
    opp: isHome ? r.away : r.home,
  };
}

function leadVerb(teamScore: number, oppScore: number): string {
  if (teamScore > oppScore) return "leads";
  if (teamScore < oppScore) return "trails";
  return "tied with";
}

/** Push title/body for a detected event. Pure + testable so copy can be unit-checked. */
export function eventMessage(
  entry: string,
  r: GameResult,
  team: TeamAbbr,
  ev: DetectedEvent,
): { title: string; body: string } {
  const { teamScore, oppScore, opp } = sides(r, team);
  const score = teamScore != null && oppScore != null ? `${teamScore}-${oppScore}` : "";

  if (ev.type === "final") {
    const title =
      ev.outcome === "won" ? `${entry} survived! 🎉`
      : ev.outcome === "tie" ? `${entry}: ${team} tied`
      : `${entry} is out 😞`;
    const verb = ev.outcome === "won" ? "beat" : ev.outcome === "tie" ? "tied" : "lost to";
    return { title, body: `${team} ${verb} ${opp}${score ? ` ${score}` : ""}.` };
  }
  if (ev.type === "halftime") {
    const rel = teamScore != null && oppScore != null ? ` — ${team} ${leadVerb(teamScore, oppScore)} ${score}` : "";
    return { title: `${entry}: halftime`, body: `${team} vs ${opp}${rel}.` };
  }
  // close
  const clk = r.clock ? ` ${r.clock} left` : "";
  const rel = teamScore != null && oppScore != null ? `${team} ${leadVerb(teamScore, oppScore)} ${score}` : `${team} vs ${opp}`;
  return { title: `${entry}: close game! 🚨`, body: `${rel},${clk} in Q${r.period ?? 4} — your pick's on the line.` };
}
