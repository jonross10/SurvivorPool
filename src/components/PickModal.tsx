import TeamLogo from "./TeamLogo";
import WinProbPill from "./WinProbPill";
import type { WinProb } from "@/lib/types";

type OverrideOutcome = "survived" | "out" | "revived";

/** Modal for choosing/swapping an entry's team for one week, plus result overrides. */
export default function PickModal({
  entry, week, current, wps, ranks,
  onClose, onClear, onPick, onOverride, onClearOverride,
}: {
  entry: string;
  week: number;
  current?: string;
  wps: WinProb[];
  ranks: Record<string, number>;
  onClose: () => void;
  onClear: (entry: string, week: number) => void;
  onPick: (entry: string, week: number, team: string, prob: number) => void;
  onOverride: (entry: string, week: number, outcome: OverrideOutcome) => void;
  onClearOverride: (entry: string, week: number) => void;
}) {
  const weekTeams = wps.filter((w) => w.week === week).sort((a, b) => b.prob - a.prob);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-96 flex-col rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{entry} — Week {week}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        {current && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
            <span className="flex items-center gap-2">
              <TeamLogo abbr={current} size={22} />
              <span className="font-semibold">{current}</span>
              <span className="text-xs text-emerald-700">current pick</span>
            </span>
            <button onClick={() => onClear(entry, week)} className="text-sm text-red-500 underline">
              Clear
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
          <span className="text-slate-500">Result override:</span>
          <button
            onClick={() => onOverride(entry, week, "survived")}
            className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-200"
          >
            Mark survived
          </button>
          <button
            onClick={() => onOverride(entry, week, "out")}
            className="rounded bg-red-100 px-2 py-1 font-medium text-red-700 hover:bg-red-200"
          >
            Mark out
          </button>
          <button
            onClick={() => onClearOverride(entry, week)}
            className="rounded px-2 py-1 text-slate-500 underline"
          >
            Clear
          </button>
        </div>

        <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Available teams · safest first</p>
        <div className="mt-1 flex-1 overflow-y-auto">
          {wps.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
          ) : weekTeams.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No available teams this week (all on bye or used).</p>
          ) : (
            weekTeams.map((w) => (
              <button
                key={w.team}
                onClick={() => onPick(entry, week, w.team, w.prob)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex items-center gap-2">
                  <TeamLogo abbr={w.team} size={22} />
                  <span className="font-semibold">{w.team}</span>
                  {ranks[w.team] !== undefined && (
                    <span className="text-[10px] font-medium text-slate-400">#{ranks[w.team]}</span>
                  )}
                  <span className="text-xs text-slate-400">{w.home ? "vs" : "@"} {w.opponent}</span>
                </span>
                <WinProbPill prob={w.prob} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
