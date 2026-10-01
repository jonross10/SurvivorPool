"use client";
import { useCallback, useEffect, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { useRanks } from "@/components/use-ranks";
import { usePickModal } from "@/components/use-pick-modal";
import { survivalCurve } from "@/lib/portfolio";

type Rv = { outcome: "won" | "lost" | "tie" | "pending" | "live"; teamScore: number | null; oppScore: number | null };
interface Rec {
  entry: string;
  eliminated?: boolean;
  currentPick?: string | null;
  currentPickProb?: number | null;
  picksByWeek?: Record<number, string>;
  resultsByWeek?: Record<number, Rv>;
  projectedPath?: { week: number; team: string; prob: number }[];
}

function cellClass(outcome: string | undefined, projected: boolean): string {
  if (outcome === "won" || outcome === "tie") return "bg-success-soft border-success/50";
  if (outcome === "lost") return "bg-danger-soft border-danger/50";
  if (outcome === "live") return "bg-warn-soft border-warn/50";
  return projected ? "bg-info-soft border-info/50" : "border-line";
}

export default function PlanPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [currentWk, setCurrentWk] = useState<number | null>(null);
  const [survival, setSurvival] = useState<{ week: number; prob: number }[]>([]);
  const ranks = useRanks();

  const load = useCallback(async () => {
    const doc = await (await fetch("/api/recommendations")).json();
    const list: Rec[] = (doc.data ?? []).map((d: { attributes: Rec }) => d.attributes);
    setRecs(list);
    setWeeks(doc.meta?.weeks ?? []);
    setCurrentWk(doc.meta?.currentWeek ?? null);
    // Portfolio survival over the next up-to-6 projected weeks (alive entries only).
    const alive = list.filter((r) => !r.eliminated);
    const plans = alive.map((r) => ({ entry: r.entry, path: r.projectedPath ?? [] }));
    const future = [...new Set(plans.flatMap((p) => p.path.map((x) => x.week)))].sort((a, b) => a - b).slice(0, 6);
    setSurvival(survivalCurve(plans, future));
  }, []);
  useEffect(() => { load(); }, [load]);

  const modal = usePickModal(load);

  function cellFor(r: Rec, w: number): { team?: string; outcome?: string; projected: boolean; score?: string } {
    const picked = r.picksByWeek?.[w];
    if (picked) {
      const rv = r.resultsByWeek?.[w];
      const score = rv && rv.teamScore != null && rv.oppScore != null && rv.outcome !== "pending" ? `${rv.teamScore}–${rv.oppScore}` : undefined;
      return { team: picked, outcome: rv?.outcome, projected: false, score };
    }
    const proj = r.projectedPath?.find((p) => p.week === w);
    return proj ? { team: proj.team, projected: true } : { projected: false };
  }

  return (
    <main className="mx-auto max-w-4xl px-3 py-5">
      <h1 className="font-display text-3xl uppercase tracking-wide">Projected Picks</h1>
      {survival.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Chance ≥1 entry survives through:</span>
          {survival.map((s) => (
            <span key={s.week} className="rounded-md bg-surface-2 px-2 py-1 text-xs text-muted">
              Wk {s.week} <strong className="text-fg">{Math.round(s.prob * 100)}%</strong>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-line bg-surface px-3 py-1 text-left font-semibold text-fg">Entry</th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[56px] border-b border-line px-2 py-1 font-medium text-muted">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.entry} className={r.eliminated ? "opacity-50" : ""}>
                <td className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-line bg-surface px-3 py-1 font-semibold text-fg">
                  {r.entry}{r.eliminated ? " (out)" : ""}
                </td>
                {weeks.map((w) => {
                  const c = cellFor(r, w);
                  const proj = r.projectedPath?.find((p) => p.week === w);
                  const clickable = !r.eliminated; // out entries can't pick
                  return (
                    <td
                      key={w}
                      onClick={clickable ? () => modal.open(r.entry, w, r.picksByWeek?.[w]) : undefined}
                      title={proj ? `${Math.round(proj.prob * 100)}% projected` : c.score}
                      className={`h-12 min-w-[56px] border-b border-r px-1 py-1 text-center align-top ${clickable ? "cursor-pointer hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent" : ""} ${cellClass(c.outcome, c.projected)}`}
                    >
                      {c.team ? (
                        <div className="flex flex-col items-center">
                          <TeamLogo abbr={c.team} size={18} />
                          <span className="font-display text-[10px] uppercase tracking-wide">{c.team}</span>
                          {c.score ? <span className="text-[9px] tabular-nums text-muted">{c.score}</span>
                            : proj ? <span className="text-[9px] text-muted">{Math.round(proj.prob * 100)}%</span>
                            : (w === currentWk && r.currentPickProb != null)
                              ? <span className="text-[9px] text-muted">{Math.round(r.currentPickProb * 100)}%</span>
                              : null}
                        </div>
                      ) : (
                        <span className="text-muted">+</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Past = actual result (green win / red loss). Future = projected plan with win %. Click a cell to pick.</p>
      {modal.render(ranks)}
    </main>
  );
}
