import Modal from "./Modal";
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
    <Modal onClose={onClose} className="flex max-h-[80vh] w-96 flex-col">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl uppercase tracking-wide">{entry} — Week {week}</h3>
          <button onClick={onClose} className="text-muted transition-colors hover:text-fg">✕</button>
        </div>

        {current && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-success-soft px-3 py-2">
            <span className="flex items-center gap-2">
              <TeamLogo abbr={current} size={22} />
              <span className="font-display uppercase">{current}</span>
              <span className="text-xs text-success">current pick</span>
            </span>
            <button onClick={() => onClear(entry, week)} className="text-sm text-danger underline">
              Clear
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
          <span className="text-muted">Result override:</span>
          <button
            onClick={() => onOverride(entry, week, "survived")}
            className="rounded bg-success-soft px-2 py-1 font-medium text-success transition-colors hover:opacity-80"
          >
            Mark survived
          </button>
          <button
            onClick={() => onOverride(entry, week, "out")}
            className="rounded bg-danger-soft px-2 py-1 font-medium text-danger transition-colors hover:opacity-80"
          >
            Mark out
          </button>
          <button
            onClick={() => onClearOverride(entry, week)}
            className="rounded px-2 py-1 text-muted underline"
          >
            Clear
          </button>
        </div>

        <p className="mt-3 text-xs uppercase tracking-wide text-muted">Available teams · safest first</p>
        <div className="mt-1 flex-1 overflow-y-auto">
          {wps.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Loading…</p>
          ) : weekTeams.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">No available teams this week (all on bye or used).</p>
          ) : (
            weekTeams.map((w) => (
              <button
                key={w.team}
                onClick={() => onPick(entry, week, w.team, w.prob)}
                className="flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <span className="flex items-center gap-2">
                  <TeamLogo abbr={w.team} size={22} />
                  <span className="font-display uppercase">{w.team}</span>
                  {ranks[w.team] !== undefined && (
                    <span className="text-[10px] font-medium text-muted">#{ranks[w.team]}</span>
                  )}
                  <span className="text-xs text-muted">{w.home ? "vs" : "@"} {w.opponent}</span>
                </span>
                <WinProbPill prob={w.prob} />
              </button>
            ))
          )}
        </div>
    </Modal>
  );
}
