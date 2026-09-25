"use client";
import { useState } from "react";
import TeamLogo from "./TeamLogo";
import WinProbPill from "./WinProbPill";
import GameCard from "./GameCard";
import EntrySettingsModal from "./EntrySettingsModal";
import type { GameView, Recommendation } from "@/lib/types";

export type Rec = Recommendation & {
  currentPick?: string | null;
  entryId?: string;
  picksByWeek?: Record<number, string>;
  eliminated?: boolean;
  eliminatedWeek?: number | null;
  settings?: { ties_survive?: boolean; pool?: string };
  resultsByWeek?: Record<number, {
    week: number; team: string; outcome: "won" | "lost" | "tie" | "pending" | "live";
    teamScore: number | null; oppScore: number | null; opponent: string | null; statusDetail: string;
  }>;
};

/** Timeline cell color: green = win, red = loss, amber = live, blue = current week (pending). */
function cellClasses(outcome: string | undefined, isCurrent: boolean, eliminated: boolean): string {
  if (outcome === "won" || outcome === "tie") return "border-emerald-400 bg-emerald-50";
  if (outcome === "lost") return "border-red-400 bg-red-50";
  if (outcome === "live") return "border-amber-400 bg-amber-50";
  if (isCurrent && !eliminated) return "border-blue-300 bg-blue-50";
  return "border-slate-100";
}

export default function EntryCard({
  rec: r, weeks, ranks, weekGames,
  onOpenWeek, onUndo, onConfirm, onRevive, onToggleTies, onSetPool, onRemove,
}: {
  rec: Rec;
  weeks: number[];
  ranks: Record<string, number>;
  weekGames: GameView[];
  onOpenWeek: (rec: Rec, week: number) => void;
  onUndo: (rec: Rec) => void;
  onConfirm: (rec: Rec) => void;
  onRevive: (rec: Rec) => void;
  onToggleTies: (rec: Rec, value: boolean) => void;
  onSetPool: (rec: Rec, pool: string) => void;
  onRemove: (rec: Rec) => void;
}) {
  const gameFor = (team: string | null | undefined): GameView | undefined =>
    team ? weekGames.find((x) => x.home === team || x.away === team) : undefined;
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        r.eliminated ? "border-red-300 bg-red-50/40 opacity-80" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className={`text-lg font-bold ${r.eliminated ? "text-red-700" : ""}`}>{r.entry}</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Entry settings"
          className="text-slate-300 transition-colors hover:text-slate-600"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
      {settingsOpen && (
        <EntrySettingsModal
          entryName={r.entry}
          pool={r.settings?.pool ?? "main"}
          tiesSurvive={r.settings?.ties_survive ?? true}
          onClose={() => setSettingsOpen(false)}
          onSetPool={(v) => onSetPool(r, v)}
          onToggleTies={(v) => onToggleTies(r, v)}
          onDelete={() => { setSettingsOpen(false); onRemove(r); }}
        />
      )}

      {r.eliminated ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            Eliminated{r.eliminatedWeek ? ` — Week ${r.eliminatedWeek}` : ""}
          </span>
          {r.eliminatedWeek && (
            <button
              onClick={() => onRevive(r)}
              title="Buy-back: keep the loss on record but mark them back in"
              className="text-xs font-medium text-emerald-700 underline"
            >
              Revive entry
            </button>
          )}
        </div>
      ) : r.currentPick ? (
        <div className="mt-2">
          <div className="flex items-center gap-3">
            <TeamLogo abbr={r.currentPick} size={40} />
            <span className="text-2xl font-bold">{r.currentPick}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ picked
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Locked in for Week {r.week}.</p>
          {(() => {
            const g = gameFor(r.currentPick);
            return g ? (
              <div className="mt-2">
                <GameCard game={g} result={g.result} highlightTeam={r.currentPick} ranks={ranks} />
              </div>
            ) : null;
          })()}
          <button onClick={() => onUndo(r)} className="mt-3 text-sm text-slate-500 underline">
            Undo pick
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">Suggested</p>
          <div className="mt-1 flex items-center gap-3">
            {r.pick && <TeamLogo abbr={r.pick} size={40} />}
            <span className="text-2xl font-bold">{r.pick ?? "—"}</span>
            {r.pick && <WinProbPill prob={r.prob} />}
          </div>
          {(() => {
            const g = gameFor(r.pick);
            return g ? (
              <div className="mt-2">
                <GameCard game={g} result={g.result} highlightTeam={r.pick} ranks={ranks} />
              </div>
            ) : null;
          })()}
          <p className="mt-2 text-sm text-slate-600">{r.reasoning}</p>
          {r.greedyAlt && r.greedyAlt.team !== r.pick && (
            <p className="mt-1 text-xs text-slate-400">
              Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
            </p>
          )}
          <button
            onClick={() => onConfirm(r)}
            disabled={!r.pick}
            className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
          >
            Confirm pick
          </button>
        </div>
      )}

      {/* Season timeline — click a week to pick/swap that entry's team */}
      {weeks.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {weeks.map((w) => {
              const team = r.picksByWeek?.[w];
              const isCurrent = w === r.week;
              const rv = r.resultsByWeek?.[w];
              return (
                <button
                  key={w}
                  onClick={() => onOpenWeek(r, w)}
                  title={rv?.statusDetail || `Pick ${r.entry}'s Week ${w} team`}
                  className={`flex w-[46px] shrink-0 flex-col items-center rounded-lg border px-1 py-1 transition-colors hover:border-slate-400 hover:bg-slate-50 ${cellClasses(rv?.outcome, isCurrent, !!r.eliminated)}`}
                >
                  <span className="text-[10px] text-slate-400">W{w}</span>
                  {team ? (
                    <>
                      <TeamLogo abbr={team} size={20} />
                      <span className="text-[10px] font-semibold">{team}</span>
                      {/* Only show a score once the game has actually played (not 0–0 pre-kickoff). */}
                      {rv && rv.outcome !== "pending" && rv.teamScore != null && rv.oppScore != null && (
                        <span className="text-[9px] tabular-nums text-slate-500">
                          {rv.teamScore}–{rv.oppScore}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="py-1 text-slate-300">+</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
