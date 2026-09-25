"use client";
import { useCallback, useEffect, useState } from "react";
import TeamLogo from "@/components/TeamLogo";
import { useRanks } from "@/components/use-ranks";
import { usePickModal } from "@/components/use-pick-modal";

type Rv = { outcome: "won" | "lost" | "tie" | "pending" | "live"; teamScore: number | null; oppScore: number | null };
interface Rec {
  entry: string;
  eliminated?: boolean;
  picksByWeek?: Record<number, string>;
  resultsByWeek?: Record<number, Rv>;
  projectedPath?: { week: number; team: string; prob: number }[];
}

function cellClass(outcome: string | undefined, projected: boolean): string {
  if (outcome === "won" || outcome === "tie") return "bg-emerald-50 border-emerald-300";
  if (outcome === "lost") return "bg-red-50 border-red-300";
  if (outcome === "live") return "bg-amber-50 border-amber-300";
  return projected ? "bg-blue-50/40 border-blue-100" : "border-slate-100";
}

export default function PlanPage() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [survival, setSurvival] = useState<{ week: number; prob: number }[]>([]);
  const ranks = useRanks();

  const load = useCallback(async () => {
    const doc = await (await fetch("/api/recommendations?safetyFloor=0.6")).json();
    const list: Rec[] = (doc.data ?? []).map((d: { attributes: Rec }) => d.attributes);
    setRecs(list);
    setWeeks(doc.meta?.weeks ?? []);
    // Portfolio survival over the next up-to-6 projected weeks (alive entries only).
    const alive = list.filter((r) => !r.eliminated);
    const future = [...new Set(alive.flatMap((r) => (r.projectedPath ?? []).map((p) => p.week)))].sort((a, b) => a - b).slice(0, 6);
    const curve = future.map((week) => {
      const pAllOut = alive.reduce((acc, r) => {
        const s = (r.projectedPath ?? []).filter((p) => p.week <= week).reduce((prod, p) => prod * p.prob, 1);
        return acc * (1 - s);
      }, 1);
      return { week, prob: alive.length ? 1 - pAllOut : 0 };
    });
    setSurvival(curve);
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
    <main className="mx-auto max-w-none px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Projected Picks</h1>
      {survival.length > 0 && (
        <p className="mt-1 text-sm text-slate-500">
          Portfolio P(≥1 alive):{" "}
          {survival.map((s) => <span key={s.week} className="mr-3"><strong className="text-slate-800">W{s.week}</strong> {Math.round(s.prob * 100)}%</span>)}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-slate-200 bg-slate-50 px-3 py-1 text-left font-semibold">Entry</th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[56px] border-b border-slate-200 px-2 py-1 font-medium text-slate-500">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.entry} className={r.eliminated ? "opacity-50" : ""}>
                <td className="sticky left-0 z-20 w-[120px] min-w-[120px] border-b border-r border-slate-200 bg-white px-3 py-1 font-semibold">
                  {r.entry}{r.eliminated ? " (out)" : ""}
                </td>
                {weeks.map((w) => {
                  const c = cellFor(r, w);
                  const proj = r.projectedPath?.find((p) => p.week === w);
                  return (
                    <td
                      key={w}
                      onClick={() => modal.open(r.entry, w, r.picksByWeek?.[w])}
                      title={proj ? `${Math.round(proj.prob * 100)}% projected` : c.score}
                      className={`cursor-pointer border-b border-r px-1 py-1 text-center align-top hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-slate-900 ${cellClass(c.outcome, c.projected)}`}
                    >
                      {c.team ? (
                        <div className="flex flex-col items-center">
                          <TeamLogo abbr={c.team} size={18} />
                          <span className="text-[10px] font-semibold">{c.team}</span>
                          {c.score ? <span className="text-[9px] tabular-nums text-slate-500">{c.score}</span>
                            : proj ? <span className="text-[9px] text-slate-400">{Math.round(proj.prob * 100)}%</span> : null}
                        </div>
                      ) : (
                        <span className="text-slate-300">+</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Past = actual result (green win / red loss). Future = projected plan with win %. Click a cell to pick.</p>
      {modal.render(ranks)}
    </main>
  );
}
