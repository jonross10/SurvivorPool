"use client";
import { useCallback, useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import { fetchAliveEntryNames, recordPick, removePick, errorDetail } from "@/lib/api-client";
import type { GameView, Recommendation } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";
import GameCard from "@/components/GameCard";
import { useRanks } from "@/components/use-ranks";

interface EntryState { name: string; usedTeams: string[]; picksByWeek: Record<number, string> }

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function MatchupsPage() {
  const [weeks, setWeeks] = useState<number[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [games, setGames] = useState<GameView[]>([]);
  const [entryNames, setEntryNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const ranks = useRanks();

  useEffect(() => { fetchAliveEntryNames().then(setEntryNames); }, []);

  useEffect(() => { if (!entry && entryNames.length) setEntry(entryNames[0]); }, [entryNames, entry]);

  const loadMatchups = useCallback(async (w: number | null) => {
    const url = w ? `/api/matchups?filter[week]=${w}` : "/api/matchups";
    const res = await fetch(url);
    const doc = await res.json();
    setGames(unwrapMany<GameView>(doc));
    setWeeks(doc.meta?.weeks ?? []);
    setWeek(doc.meta?.week ?? doc.meta?.currentWeek ?? null);
  }, []);

  const loadState = useCallback(async () => {
    const [s, r] = await Promise.all([fetch("/api/picks-state"), fetch("/api/recommendations")]);
    setStates(unwrapMany<EntryState>(await s.json()));
    setRecs(unwrapMany<Recommendation>(await r.json()));
  }, []);

  useEffect(() => { loadMatchups(null); loadState(); }, [loadMatchups, loadState]);

  const entryState = states.find((s) => s.name === entry);
  const used = new Set(entryState?.usedTeams ?? []);
  const weekPick = week !== null ? entryState?.picksByWeek?.[week] : undefined;
  const suggested = recs.find((r) => r.entry === entry && r.week === week)?.pick ?? null;

  async function pick(team: string) {
    if (week === null || used.has(team)) return;
    const res = await recordPick(entry, week, team, 0);
    if (!res.ok) alert(await errorDetail(res, "Pick failed"));
    await loadState();
  }
  async function undo() {
    if (week === null) return;
    await removePick(entry, week);
    await loadState();
  }

  // Sort by kickoff so days appear in chronological order (and games within a day too).
  const byDay = new Map<string, GameView[]>();
  const sorted = [...games].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime(),
  );
  for (const g of sorted) {
    const d = fmtDay(g.kickoff);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(g);
  }

  const tab = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${
      active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Matchups</h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {entryNames.map((n) => (
          <button key={n} onClick={() => setEntry(n)} className={tab(entry === n)}>{n}</button>
        ))}
        {weekPick && (
          <span className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <TeamLogo abbr={weekPick} size={20} />
            Week {week} pick: <strong className="text-slate-800">{weekPick}</strong>
            <button onClick={undo} className="underline">undo</button>
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {weeks.map((w) => (
          <button key={w} onClick={() => loadMatchups(w)} className={tab(w === week)}>W{w}</button>
        ))}
      </div>

      {[...byDay.entries()].map(([day, gs]) => (
        <section key={day} className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{day}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gs.map((g) => (
              <GameCard
                key={`${g.away}@${g.home}`}
                game={g}
                result={g.result}
                ranks={ranks}
                onPick={pick}
                usedTeams={used}
                pickedTeam={weekPick}
                suggestedTeam={suggested}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
