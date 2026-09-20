import TeamLogo from "./TeamLogo";
import WinProbPill from "./WinProbPill";
import type { GameView, GameResult } from "@/lib/types";

function fmtSpread(s: number | null): string {
  if (s === null) return "";
  if (s === 0) return "PK";
  return s > 0 ? `+${s}` : `${s}`;
}
function fmtOdds(o: number | null): string {
  if (o === null) return "";
  return o > 0 ? `+${o}` : `${o}`;
}
function fmtKick(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Compact, display-only matchup card: two team rows with win-prob pills and
 * spread/odds, switching to scores once a game is live or final. `highlightTeam`
 * tints the picked/suggested team's row. Mirrors the Matchups tab styling.
 */
export default function GameCard({
  game, result, highlightTeam, ranks = {},
}: {
  game: GameView;
  result?: GameResult | null;
  highlightTeam?: string | null;
  ranks?: Record<string, number>;
}) {
  const completed = !!result?.completed;
  const live = !!result?.inProgress && !completed;

  function row(team: string, prob: number, odds: number | null, spread: number | null) {
    const isPick = highlightTeam === team;
    const teamScore = result ? (result.home === team ? result.homeScore : result.awayScore) : null;
    const isWinner = completed && result!.winner === team;
    const isLoser = completed && result!.winner !== null && result!.winner !== team;
    const rowClass = isWinner || (isPick && !completed) ? "bg-emerald-50" : isLoser ? "opacity-60" : "";
    return (
      <div className={`flex items-center justify-between rounded-md px-2 py-1.5 ${rowClass}`}>
        <span className="flex items-center gap-2">
          <TeamLogo abbr={team} size={20} />
          <span className={`text-sm font-semibold ${isWinner ? "text-emerald-800" : ""}`}>{team}</span>
          {ranks[team] !== undefined && (
            <span className="text-[10px] font-medium text-slate-400" title="Power ranking">#{ranks[team]}</span>
          )}
          {isPick && <span className="text-xs text-emerald-600">✓</span>}
        </span>
        {completed || live ? (
          <span
            className={`text-base font-bold tabular-nums ${
              isWinner ? "text-emerald-700" : live ? "text-amber-700" : isLoser ? "text-slate-400" : "text-slate-600"
            }`}
          >
            {teamScore ?? "—"}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <WinProbPill prob={prob} />
            <span className="w-16 text-right text-xs text-slate-500">
              {spread !== null && <span className="font-medium">{fmtSpread(spread)}</span>}{" "}
              <span className="text-slate-400">{fmtOdds(odds)}</span>
            </span>
          </span>
        )}
      </div>
    );
  }

  const statusTag = completed ? "Final" : live ? `LIVE · ${result!.statusDetail}` : fmtKick(game.kickoff);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-1.5">
      <div className="flex items-center justify-between px-2 text-[11px] text-slate-400">
        <span>{game.away} @ {game.home}</span>
        <span className={live ? "font-medium text-amber-600" : ""}>{statusTag}</span>
      </div>
      {row(game.away, game.awayProb, game.awayOdds, game.homeSpread === null ? null : -game.homeSpread)}
      {row(game.home, game.homeProb, game.homeOdds, game.homeSpread)}
    </div>
  );
}
