"use client";
import { useCallback, useEffect, useState } from "react";
import type { WinProb } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import { fetchAliveEntryNames, recordPick, errorDetail } from "@/lib/api-client";
import TeamRow from "@/components/TeamRow";
import ConfirmPickModal from "@/components/ConfirmPickModal";
import { useRanks } from "@/components/use-ranks";

function color(p: number): string {
  const hue = Math.round(p * 120); // 0=red, 120=green
  return `hsl(${hue}, 70%, 85%)`;
}

interface Pending { team: string; week: number; prob: number }

export default function GridPage() {
  const [entryNames, setEntryNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [wps, setWps] = useState<WinProb[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ranks = useRanks();

  useEffect(() => { fetchAliveEntryNames().then(setEntryNames); }, []);

  useEffect(() => { if (!entry && entryNames.length) setEntry(entryNames[0]); }, [entryNames, entry]);

  const load = useCallback(() => {
    if (!entry) return;
    fetch(`/api/grid?filter[entry]=${encodeURIComponent(entry)}`)
      .then((r) => r.json())
      .then((doc) => setWps(unwrapMany<WinProb>(doc)));
  }, [entry]);

  useEffect(() => { load(); }, [load]);

  const weeks = [...new Set(wps.map((w) => w.week))].sort((a, b) => a - b);
  // Order teams by power ranking (best first); unranked teams fall to the bottom.
  const teams = [...new Set(wps.map((w) => w.team))].sort(
    (a, b) => (ranks[a] ?? Infinity) - (ranks[b] ?? Infinity),
  );
  const cell = new Map(wps.map((w) => [`${w.week}:${w.team}`, w]));

  async function confirmPick() {
    if (!pending) return;
    const res = await recordPick(entry, pending.week, pending.team, pending.prob);
    if (!res.ok) {
      setError(await errorDetail(res, "Pick failed"));
      return;
    }
    setPending(null);
    setError(null);
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-3 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide">Win-Probability Grid</h1>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        >
          {entryNames.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <p className="mt-1 text-sm text-muted">
        Teams {entry} still has available, colored by win probability (green = safer). Click a cell to pick that team.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-line bg-surface px-3 py-1 text-left font-semibold text-fg">
                Team
              </th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[46px] border-b border-line px-2 py-1 font-medium text-muted">
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t}>
                <td className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-line bg-surface px-3 py-1">
                  <TeamRow abbr={t} size={20} rank={ranks[t]} />
                </td>
                {weeks.map((w) => {
                  const c = cell.get(`${w}:${t}`);
                  return (
                    <td
                      key={w}
                      onClick={() => c && setPending({ team: t, week: w, prob: c.prob })}
                      className={`border-b border-line px-2 py-1 text-center text-xs ${
                        c ? "cursor-pointer text-black hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-accent" : ""
                      }`}
                      style={{ background: c ? color(c.prob) : "var(--surface-2)" }}
                    >
                      {c ? `${Math.round(c.prob * 100)}%` : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmPickModal
          entry={entry}
          team={pending.team}
          week={pending.week}
          prob={pending.prob}
          error={error}
          onConfirm={confirmPick}
          onCancel={() => { setPending(null); setError(null); }}
        />
      )}
    </main>
  );
}
