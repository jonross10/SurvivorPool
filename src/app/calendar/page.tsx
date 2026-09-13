"use client";
import { useEffect, useMemo, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { Matchup } from "@/lib/types";
import TeamRow from "@/components/TeamRow";
import { useRanks } from "@/components/use-ranks";

const TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

interface EntryState { name: string; usedTeams: string[] }

export default function CalendarPage() {
  const [games, setGames] = useState<Matchup[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [entryNames, setEntryNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);
  const ranks = useRanks();

  useEffect(() => {
    fetch("/api/entries").then((r) => r.json())
      .then((doc) => setEntryNames((doc.data ?? []).map((e: { attributes: { name: string } }) => e.attributes.name)));
  }, []);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((doc) => {
      setGames(unwrapMany<Matchup>(doc));
      setWeeks(doc.meta?.weeks ?? []);
    });
    fetch("/api/picks-state").then((r) => r.json()).then((doc) => setStates(unwrapMany<EntryState>(doc)));
  }, []);

  // cell[team][week] = { opp, home } or undefined (BYE)
  const cell = useMemo(() => {
    const m = new Map<string, Map<number, { opp: string; home: boolean }>>();
    for (const t of TEAMS) m.set(t, new Map());
    for (const g of games) {
      m.get(g.home)?.set(g.week, { opp: g.away, home: true });
      m.get(g.away)?.set(g.week, { opp: g.home, home: false });
    }
    return m;
  }, [games]);

  const used = new Set(states.find((s) => s.name === entry)?.usedTeams ?? []);

  return (
    <main className="mx-auto max-w-none px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Season Calendar</h1>
        <label className="text-sm text-slate-500">
          Dim used teams for{" "}
          <select
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
          >
            {["", ...entryNames].map((n) => <option key={n} value={n}>{n || "— none —"}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-slate-200 bg-slate-50 px-3 py-1 text-left font-semibold">
                Team
              </th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[52px] border-b border-slate-200 px-2 py-1 font-medium text-slate-500">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => {
              const dim = used.has(t);
              return (
                <tr key={t} className={dim ? "opacity-40" : ""}>
                  <td className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-slate-200 bg-white px-3 py-1">
                    <TeamRow abbr={t} size={18} rank={ranks[t]} />
                  </td>
                  {weeks.map((w) => {
                    const c = cell.get(t)?.get(w);
                    return (
                      <td
                        key={w}
                        className={`border-b border-slate-100 px-2 py-1 text-center ${
                          c ? (c.home ? "bg-emerald-50" : "bg-slate-50 text-slate-500") : ""
                        }`}
                      >
                        {c ? (c.home ? c.opp : `@${c.opp}`) : ""}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Green = home · grey = away · blank = BYE</p>
    </main>
  );
}
