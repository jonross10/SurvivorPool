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
  settings?: { ties_survive?: boolean; pool?: string; min_win_chance?: number; pick_due?: { day: number; time: string } | null };
  resultsByWeek?: Record<number, {
    week: number; team: string; outcome: "won" | "lost" | "tie" | "pending" | "live";
    teamScore: number | null; oppScore: number | null; opponent: string | null; statusDetail: string;
  }>;
};

/** Timeline cell color: green = win, red = loss, amber = live, blue = current week (pending). */
function cellClasses(outcome: string | undefined, isCurrent: boolean, eliminated: boolean): string {
  if (outcome === "won" || outcome === "tie") return "border-success/50 bg-success-soft";
  if (outcome === "lost") return "border-danger/50 bg-danger-soft";
  if (outcome === "live") return "border-warn/50 bg-warn-soft";
  if (isCurrent && !eliminated) return "border-info/50 bg-info-soft";
  return "border-line bg-surface-2/40";
}

export default function EntryCard({
  rec: r, weeks, ranks, weekGames,
  onOpenWeek, onUndo, onConfirm, onRevive, onToggleTies, onSetPool, onSetFloor, onSetPickDue, onRemove,
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
  onSetFloor: (rec: Rec, value: number) => void;
  onSetPickDue: (rec: Rec, value: { day: number; time: string } | null) => void;
  onRemove: (rec: Rec) => void;
}) {
  const gameFor = (team: string | null | undefined): GameView | undefined =>
    team ? weekGames.find((x) => x.home === team || x.away === team) : undefined;
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      className={`rounded-2xl border p-4 shadow-card ${
        r.eliminated ? "border-danger/40 bg-danger-soft opacity-90" : "border-line bg-surface"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className={`font-display text-xl uppercase tracking-wide ${r.eliminated ? "text-danger" : "text-fg"}`}>{r.entry}</h2>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Entry settings"
          className="text-muted transition-colors hover:text-fg"
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
          minWinChance={r.settings?.min_win_chance ?? 0.6}
          pickDue={r.settings?.pick_due ?? null}
          onClose={() => setSettingsOpen(false)}
          onSetPool={(v) => onSetPool(r, v)}
          onToggleTies={(v) => onToggleTies(r, v)}
          onSetFloor={(v) => onSetFloor(r, v)}
          onSetPickDue={(v) => onSetPickDue(r, v)}
          onDelete={() => { setSettingsOpen(false); onRemove(r); }}
        />
      )}

      {r.eliminated ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="inline-block rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">
            Eliminated{r.eliminatedWeek ? ` — Week ${r.eliminatedWeek}` : ""}
          </span>
          {r.eliminatedWeek && (
            <button
              onClick={() => onRevive(r)}
              title="Buy-back: keep the loss on record but mark them back in"
              className="text-xs font-semibold text-success underline"
            >
              Revive entry
            </button>
          )}
        </div>
      ) : r.currentPick ? (
        <div className="mt-2">
          <div className="flex items-center gap-3">
            <TeamLogo abbr={r.currentPick} size={40} />
            <span className="font-display text-3xl uppercase tracking-wide">{r.currentPick}</span>
            <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
              ✓ picked
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">Locked in for Week {r.week}.</p>
          {(() => {
            const g = gameFor(r.currentPick);
            return g ? (
              <div className="mt-2">
                <GameCard game={g} result={g.result} highlightTeam={r.currentPick} ranks={ranks} />
              </div>
            ) : null;
          })()}
          <button onClick={() => onUndo(r)} className="mt-3 text-sm text-muted underline hover:text-fg">
            Undo pick
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Suggested</p>
          <div className="mt-1 flex items-center gap-3">
            {r.pick && <TeamLogo abbr={r.pick} size={40} />}
            <span className="font-display text-3xl uppercase tracking-wide">{r.pick ?? "—"}</span>
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
          <p className="mt-2 text-sm text-muted">{r.reasoning}</p>
          {r.greedyAlt && r.greedyAlt.team !== r.pick && (
            <p className="mt-1 text-xs text-muted">
              Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
            </p>
          )}
          <button
            onClick={() => onConfirm(r)}
            disabled={!r.pick}
            className="mt-3 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Confirm pick
          </button>
        </div>
      )}

      {/* Season timeline — click a week to pick/swap that entry's team */}
      {weeks.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {weeks.map((w) => {
              const team = r.picksByWeek?.[w];
              const isCurrent = w === r.week;
              const rv = r.resultsByWeek?.[w];
              return (
                <button
                  key={w}
                  onClick={() => onOpenWeek(r, w)}
                  title={rv?.statusDetail || `Pick ${r.entry}'s Week ${w} team`}
                  className={`flex w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-xl border px-1 py-1.5 transition-colors hover:border-muted ${cellClasses(rv?.outcome, isCurrent, !!r.eliminated)}`}
                >
                  <span className={`text-[10px] font-semibold ${isCurrent && !r.eliminated ? "text-info" : "text-muted"}`}>W{w}</span>
                  {team ? (
                    <>
                      <TeamLogo abbr={team} size={22} />
                      <span className="font-display text-[11px] uppercase tracking-wide">{team}</span>
                      {/* Only show a score once the game has actually played (not 0–0 pre-kickoff). */}
                      {rv && rv.outcome !== "pending" && rv.teamScore != null && rv.oppScore != null && (
                        <span className="text-[9px] tabular-nums text-muted">
                          {rv.teamScore}–{rv.oppScore}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="py-1.5 text-lg leading-none text-muted/60">+</span>
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
