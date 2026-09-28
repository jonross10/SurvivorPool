"use client";
import { useCallback, useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import { fetchAliveEntryNames, recordPick, removePick, errorDetail } from "@/lib/api-client";
import type { GameView, Recommendation } from "@/lib/types";
import TeamLogo from "@/components/TeamLogo";
import GameCard from "@/components/GameCard";
import ConfirmPickModal from "@/components/ConfirmPickModal";
import { useRanks } from "@/components/use-ranks";

interface EntryState { name: string; usedTeams: string[]; picksByWeek: Record<number, string> }
interface Pending { team: string; week: number; prob: number }

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
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Clicking a team opens a confirm modal instead of picking immediately, so an
  // accidental tap can't record (or swap) a pick.
  function pick(team: string) {
    if (week === null || used.has(team)) return;
    const g = games.find((x) => x.home === team || x.away === team);
    const prob = g ? (g.home === team ? g.homeProb : g.awayProb) : 0;
    setError(null);
    setPending({ team, week, prob });
  }
  async function confirmPick() {
    if (!pending) return;
    const res = await recordPick(entry, pending.week, pending.team, pending.prob);
    if (!res.ok) { setError(await errorDetail(res, "Pick failed")); return; }
    setPending(null);
    setError(null);
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

  const tab = (active: boolean) => `pill ${active ? "pill-active" : ""}`;

  return (
    <main className="mx-auto max-w-4xl px-3 py-5">
      <h1 className="font-display text-3xl uppercase tracking-wide">
        Matchups {week !== null && <span className="text-accent">W{week}</span>}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {entryNames.map((n) => (
          <button key={n} onClick={() => setEntry(n)} className={tab(entry === n)}>{n}</button>
        ))}
        {weekPick && (
          <span className="ml-auto flex items-center gap-2 text-sm text-muted">
            <TeamLogo abbr={weekPick} size={20} />
            Week {week} pick: <strong className="text-fg">{weekPick}</strong>
            <button onClick={undo} className="text-accent underline">undo</button>
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {weeks.map((w) => (
          <button key={w} onClick={() => loadMatchups(w)} className={tab(w === week)}>W{w}</button>
        ))}
      </div>

      {[...byDay.entries()].map(([day, gs]) => (
        <section key={day} className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{day}</h3>
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

      {pending && (
        <ConfirmPickModal
          entry={entry}
          team={pending.team}
          week={pending.week}
          prob={pending.prob}
          replaces={weekPick}
          error={error}
          onConfirm={confirmPick}
          onCancel={() => { setPending(null); setError(null); }}
        />
      )}
    </main>
  );
}
