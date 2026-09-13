"use client";
import { useCallback, useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { GameView, Recommendation } from "@/lib/types";

const ENTRY_NAMES = ["Jon", "Genevieve", "Elliot"];

interface EntryState { name: string; usedTeams: string[]; picksByWeek: Record<number, string> }

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function fmtOdds(o: number | null): string {
  if (o === null) return "—";
  return o > 0 ? `+${o}` : `${o}`;
}

export default function MatchupsPage() {
  const [weeks, setWeeks] = useState<number[]>([]);
  const [week, setWeek] = useState<number | null>(null);
  const [games, setGames] = useState<GameView[]>([]);
  const [entry, setEntry] = useState(ENTRY_NAMES[0]);
  const [states, setStates] = useState<EntryState[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);

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

  function teamButton(team: string, prob: number, odds: number | null, source: string) {
    const isUsed = used.has(team);
    const isPick = weekPick === team;
    const isSuggested = suggested === team;
    return (
      <button
        onClick={() => pick(team)}
        disabled={isUsed}
        style={{
          display: "block", width: "100%", textAlign: "left", padding: 8, marginTop: 4,
          border: isPick ? "2px solid #0a0" : isSuggested ? "2px dashed #06c" : "1px solid #ccc",
          borderRadius: 6, background: isUsed ? "#f0f0f0" : "white",
          color: isUsed ? "#999" : "black", cursor: isUsed ? "not-allowed" : "pointer",
        }}
      >
        <strong>{team}</strong> {Math.round(prob * 100)}% · {fmtOdds(odds)}
        <span style={{ fontSize: 10, color: "#888" }}> {source}</span>
        {isPick && " ✓"}{isSuggested && !isPick && " ★"}
      </button>
    );
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Matchups</h1>
      <div style={{ marginBottom: 12 }}>
        {ENTRY_NAMES.map((n) => (
          <button key={n} onClick={() => setEntry(n)}
            style={{ marginRight: 8, fontWeight: entry === n ? 700 : 400 }}>{n}</button>
        ))}
        {weekPick && <span style={{ marginLeft: 16 }}>Week {week} pick: <strong>{weekPick}</strong>{" "}
          <button onClick={undo}>undo</button></span>}
      </div>
      <div style={{ marginBottom: 16, overflowX: "auto", whiteSpace: "nowrap" }}>
        {weeks.map((w) => (
          <button key={w} onClick={() => loadMatchups(w)}
            style={{ marginRight: 6, fontWeight: w === week ? 700 : 400 }}>W{w}</button>
        ))}
      </div>
      {[...byDay.entries()].map(([day, gs]) => (
        <section key={day} style={{ marginBottom: 20 }}>
          <h3>{day}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {gs.map((g) => (
              <div key={`${g.away}@${g.home}`} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: "#888" }}>{g.away} @ {g.home}</div>
                {teamButton(g.away, g.awayProb, g.awayOdds, g.source)}
                {teamButton(g.home, g.homeProb, g.homeOdds, g.source)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
