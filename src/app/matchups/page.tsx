"use client";
import { useCallback, useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { GameView, Recommendation } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";
import WinProbPill from "@/components/WinProbPill";

interface EntryState { name: string; usedTeams: string[]; picksByWeek: Record<number, string> }

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function fmtOdds(o: number | null): string {
  if (o === null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}
function fmtSpread(s: number | null): string {
  if (s === null) return "";
  if (s === 0) return "PK";
  return s > 0 ? `+${s}` : `${s}`;
}

export default function MatchupsPage() {
  const [weeks, setWeeks] = useState<number[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [games, setGames] = useState<GameView[]>([]);
  const [entryNames, setEntryNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    fetch("/api/entries").then((r) => r.json())
      .then((doc) => setEntryNames((doc.data ?? []).map((e: { attributes: { name: string } }) => e.attributes.name)));
  }, []);

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
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week, team, winProb: 0 } } }),
    });
    if (!res.ok) alert((await res.json()).errors?.[0]?.detail ?? "Pick failed");
    await loadState();
  }
  async function undo() {
    if (week === null) return;
    await fetch("/api/pick", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week } } }),
    });
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

  function teamButton(team: string, prob: number, odds: number | null, spread: number | null, source: string) {
    const isUsed = used.has(team);
    const isPick = weekPick === team;
    const isSuggested = suggested === team;
    const stateClass = isUsed
      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
      : isPick
      ? "border-emerald-500 bg-emerald-50"
      : isSuggested
      ? "border-dashed border-blue-400 hover:bg-slate-50"
      : "border-slate-200 hover:bg-slate-50";
    return (
      <button
        onClick={() => pick(team)}
        disabled={isUsed}
        className={`mt-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${stateClass}`}
      >
        <span className="flex items-center gap-2">
          <TeamLogo abbr={team} size={22} />
          <span className="font-semibold">{team}</span>
          {isPick && <span className="text-emerald-600">✓</span>}
          {isSuggested && !isPick && <span className="text-blue-500">★</span>}
        </span>
        <span className="flex items-center gap-2">
          <WinProbPill prob={prob} />
          {source === "odds" ? (
            <span className="w-16 text-right text-xs text-slate-500">
              {spread !== null && <span className="font-medium">{fmtSpread(spread)}</span>}{" "}
              <span className="text-slate-400">{fmtOdds(odds)}</span>
            </span>
          ) : (
            <span className="w-16 text-right text-xs text-slate-400">proj</span>
          )}
        </span>
      </button>
    );
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
              <div key={`${g.away}@${g.home}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="text-xs text-slate-400">{g.away} @ {g.home}</div>
                {teamButton(g.away, g.awayProb, g.awayOdds, g.homeSpread === null ? null : -g.homeSpread, g.source)}
                {teamButton(g.home, g.homeProb, g.homeOdds, g.homeSpread, g.source)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
