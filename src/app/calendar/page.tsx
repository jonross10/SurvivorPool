"use client";
import { useEffect, useMemo, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import { fetchAliveEntryNames } from "@/lib/api-client";
import type { Matchup, GameResult } from "@/lib/types";
import { TEAMS } from "@/lib/teams";
import TeamRow from "@/components/TeamRow";
import { useRanks } from "@/components/use-ranks";

type CalGame = Matchup & { result?: GameResult | null };
type Outcome = "won" | "lost" | "tie" | "live" | null;

/** How the given team fared in a game, or null if it hasn't been decided yet. */
function outcomeFor(team: string, r: GameResult | null | undefined): Outcome {
  if (!r) return null;
  if (r.inProgress && !r.completed) return "live";
  if (!r.completed) return null;
  if (r.winner === team) return "won";
  if (r.winner === null) return "tie";
  return "lost";
}

interface EntryState { name: string; usedTeams: string[] }

export default function CalendarPage() {
  const [games, setGames] = useState<CalGame[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [entryNames, setEntryNames] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);
  const ranks = useRanks();

  useEffect(() => {
    fetchAliveEntryNames().then(setEntryNames);
  }, []);

  useEffect(() => {
    fetch("/api/schedule").then((r) => r.json()).then((doc) => {
      setGames(unwrapMany<CalGame>(doc));
      setWeeks(doc.meta?.weeks ?? []);
    });
    fetch("/api/picks-state").then((r) => r.json()).then((doc) => setStates(unwrapMany<EntryState>(doc)));
  }, []);

  // cell[team][week] = { opp, home, outcome, score } or undefined (BYE)
  type Cell = { opp: string; home: boolean; outcome: Outcome; score: string | null };
  const cell = useMemo(() => {
    const m = new Map<string, Map<number, Cell>>();
    for (const t of TEAMS) m.set(t, new Map());
    for (const g of games) {
      const r = g.result ?? null;
      const score = r && r.homeScore !== null && r.awayScore !== null
        ? { home: `${r.homeScore}–${r.awayScore}`, away: `${r.awayScore}–${r.homeScore}` }
        : null;
      m.get(g.home)?.set(g.week, { opp: g.away, home: true, outcome: outcomeFor(g.home, r), score: score?.home ?? null });
      m.get(g.away)?.set(g.week, { opp: g.home, home: false, outcome: outcomeFor(g.away, r), score: score?.away ?? null });
    }
    return m;
  }, [games]);

  const used = new Set(states.find((s) => s.name === entry)?.usedTeams ?? []);

  return (
    <main className="mx-auto max-w-4xl px-3 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl uppercase tracking-wide">Season Calendar</h1>
        <label className="text-sm text-muted">
          Dim used teams for{" "}
          <select
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          >
            {["", ...entryNames].map((n) => <option key={n} value={n}>{n || "— none —"}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-line bg-surface px-3 py-1 text-left font-semibold text-fg">
                Team
              </th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[52px] border-b border-line px-2 py-1 font-medium text-muted">W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => {
              const dim = used.has(t);
              return (
                <tr key={t} className={dim ? "opacity-40" : ""}>
                  <td className="sticky left-0 z-20 w-[116px] min-w-[116px] border-b border-r border-line bg-surface px-3 py-1">
                    <TeamRow abbr={t} size={18} rank={ranks[t]} />
                  </td>
                  {weeks.map((w) => {
                    const c = cell.get(t)?.get(w);
                    const played =
                      c?.outcome === "won" ? "bg-success-soft font-semibold text-success"
                      : c?.outcome === "lost" ? "bg-danger-soft text-danger"
                      : c?.outcome === "tie" ? "bg-warn-soft text-warn"
                      : c?.outcome === "live" ? "bg-warn-soft text-warn"
                      : null;
                    const upcoming = c ? (c.home ? "bg-success-soft" : "bg-surface-2 text-muted") : "";
                    return (
                      <td
                        key={w}
                        title={c?.score ?? undefined}
                        className={`border-b border-line px-2 py-1 text-center ${played ?? upcoming}`}
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
      <p className="mt-2 text-xs text-muted">
        Played: <span className="text-success">green = win</span> · <span className="text-danger">red = loss</span> ·
        {" "}Upcoming: green = home · grey = away · blank = BYE
      </p>
    </main>
  );
}
