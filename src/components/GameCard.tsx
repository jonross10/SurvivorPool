import TeamLogo from "./TeamLogo";
import WinProbPill from "./WinProbPill";
import { fmtSpread, fmtOdds, fmtKick } from "@/lib/format";
import type { GameView, GameResult } from "@/lib/types";

/**
 * One game rendered as two team rows: win-prob pills + spread/odds for upcoming
 * games, live/final scores otherwise. Used display-only on the Dashboard
 * (`highlightTeam`) and interactively on Matchups (`onPick` + pick state).
 */
export default function GameCard({
  game, result, ranks = {}, highlightTeam, onPick, usedTeams, pickedTeam, suggestedTeam,
}: {
  game: GameView;
  result?: GameResult | null;
  ranks?: Record<string, number>;
  /** Display-only highlight for the picked/suggested team (non-interactive). */
  highlightTeam?: string | null;
  /** Interactive mode: clicking a team row picks it. */
  onPick?: (team: string) => void;
  usedTeams?: Set<string>;
  pickedTeam?: string | null;
  suggestedTeam?: string | null;
}) {
  const completed = !!result?.completed;
  const live = !!result?.inProgress && !completed;
  const interactive = !!onPick;

  function row(team: string, prob: number, odds: number | null, spread: number | null) {
    const isUsed = interactive && !!usedTeams?.has(team);
    const isPick = interactive ? pickedTeam === team : highlightTeam === team;
    const isSuggested = interactive && suggestedTeam === team;
    const teamScore = result ? (result.home === team ? result.homeScore : result.awayScore) : null;
    const isWinner = completed && result!.winner === team;
    const isLoser = completed && result!.winner !== null && result!.winner !== team;

    const stateClass = isUsed
      ? "bg-surface-2 text-muted line-through decoration-muted/60"
      : isWinner
      ? "bg-success-soft"
      : isLoser
      ? "opacity-50"
      : live
      ? "bg-warn-soft"
      : isPick
      ? "bg-success-soft"
      : isSuggested
      ? "bg-info-soft"
      : "";
    const hover = interactive && !isUsed ? "cursor-pointer hover:bg-surface-2" : "";

    const inner = (
      <>
        <span className="flex items-center gap-2">
          <TeamLogo abbr={team} size={22} />
          <span className={`font-display text-base uppercase tracking-wide ${isWinner ? "text-success" : "text-fg"}`}>{team}</span>
          {ranks[team] !== undefined && (
            <span className="text-[10px] font-semibold text-muted" title="Power ranking">#{ranks[team]}</span>
          )}
          {isPick && <span className="text-xs text-success">✓</span>}
          {isSuggested && !isPick && !completed && !live && <span className="text-xs text-info">★</span>}
        </span>
        {completed || live ? (
          <span
            className={`text-lg font-bold tabular-nums ${
              isWinner ? "text-success" : live ? "text-warn" : isLoser ? "text-muted" : "text-fg"
            }`}
          >
            {teamScore ?? "—"}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <WinProbPill prob={prob} />
            <span className="w-16 text-right text-xs text-muted">
              {spread !== null && <span className="font-medium text-fg">{fmtSpread(spread)}</span>}{" "}
              <span className="text-muted">{fmtOdds(odds)}</span>
            </span>
          </span>
        )}
      </>
    );

    const cls = `flex items-center justify-between rounded-md px-2 py-1.5 text-left ${stateClass} ${hover}`;
    return interactive ? (
      <button key={team} onClick={() => !isUsed && onPick!(team)} disabled={isUsed} className={`w-full ${cls}`}>
        {inner}
      </button>
    ) : (
      <div key={team} className={cls}>{inner}</div>
    );
  }

  const statusTag = completed ? "Final" : live ? `LIVE · ${result!.statusDetail}` : fmtKick(game.kickoff);
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-1.5">
      <div className="flex items-center justify-between px-2 py-0.5 text-[11px] text-muted">
        <span>{game.away} @ {game.home}</span>
        <span className={live ? "font-semibold text-warn" : ""}>{statusTag}</span>
      </div>
      {row(game.away, game.awayProb, game.awayOdds, game.homeSpread === null ? null : -game.homeSpread)}
      {row(game.home, game.homeProb, game.homeOdds, game.homeSpread)}
    </div>
  );
}
