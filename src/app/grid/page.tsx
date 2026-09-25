"use client";
import { useCallback, useEffect, useState } from "react";
import type { WinProb } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import { fetchAliveEntryNames, recordPick, errorDetail } from "@/lib/api-client";
import TeamRow from "@/components/TeamRow";
import TeamLogo from "@/components/TeamLogo";
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
    <main className="mx-auto max-w-none px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Win-Probability Grid</h1>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          {entryNames.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Teams {entry} still has available, colored by win probability (green = safer). Click a cell to pick that team.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-slate-200 bg-slate-50 px-3 py-1 text-left font-semibold">
                Team
              </th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[46px] border-b border-slate-200 px-2 py-1 font-medium text-slate-500">
                  W{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t}>
                <td className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-slate-200 bg-white px-3 py-1">
                  <TeamRow abbr={t} size={20} rank={ranks[t]} />
                </td>
                {weeks.map((w) => {
                  const c = cell.get(`${w}:${t}`);
                  return (
                    <td
                      key={w}
                      onClick={() => c && setPending({ team: t, week: w, prob: c.prob })}
                      className={`border-b border-slate-100 px-2 py-1 text-center text-xs ${
                        c ? "cursor-pointer hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-slate-900" : ""
                      }`}
                      style={{ background: c ? color(c.prob) : "#f8fafc" }}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setPending(null); setError(null); }}
        >
          <div className="w-80 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">Confirm pick</h3>
            <div className="mt-3 flex items-center gap-3">
              <TeamLogo abbr={pending.team} size={36} />
              <div>
                <div className="font-semibold">{pending.team} — Week {pending.week}</div>
                <div className="text-sm text-slate-500">
                  {Math.round(pending.prob * 100)}% to win · for {entry}
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => { setPending(null); setError(null); }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmPick}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Confirm pick
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
