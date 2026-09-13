"use client";
import { useEffect, useState } from "react";
import type { WinProb } from "@/lib/types";
import { ENTRY_NAMES } from "@/lib/entries";
import { unwrapMany } from "@/lib/jsonapi-client";
import TeamRow from "@/components/TeamRow";

function color(p: number): string {
  const hue = Math.round(p * 120); // 0=red, 120=green
  return `hsl(${hue}, 70%, 85%)`;
}

export default function GridPage() {
  const [entry, setEntry] = useState(ENTRY_NAMES[0]);
  const [wps, setWps] = useState<WinProb[]>([]);

  useEffect(() => {
    fetch(`/api/grid?filter[entry]=${encodeURIComponent(entry)}`)
      .then((r) => r.json())
      .then((doc) => setWps(unwrapMany<WinProb>(doc)));
  }, [entry]);

  const weeks = [...new Set(wps.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(wps.map((w) => w.team))].sort();
  const cell = new Map(wps.map((w) => [`${w.week}:${w.team}`, w]));

  return (
    <main className="mx-auto max-w-none px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Win-Probability Grid</h1>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          {ENTRY_NAMES.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Teams {entry} still has available, colored by win probability (green = safer).
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-left font-semibold">Team</th>
              {weeks.map((w) => (
                <th key={w} className="px-2 py-1 font-medium text-slate-500">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t}>
                <td className="sticky left-0 z-10 bg-white px-2 py-1">
                  <TeamRow abbr={t} size={20} />
                </td>
                {weeks.map((w) => {
                  const c = cell.get(`${w}:${t}`);
                  return (
                    <td
                      key={w}
                      className="px-2 py-1 text-center text-xs"
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
    </main>
  );
}
