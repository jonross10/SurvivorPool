"use client";
import { useEffect, useMemo, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import type { Matchup } from "@/lib/types";

const ENTRY_NAMES = ["", "Jon", "Genevieve", "Elliot"]; // "" = none
const TEAMS = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

interface EntryState { name: string; usedTeams: string[] }

export default function CalendarPage() {
  const [games, setGames] = useState<Matchup[]>([]);
  const [weeks, setWeeks] = useState<number[]>([]);
  const [entry, setEntry] = useState("");
  const [states, setStates] = useState<EntryState[]>([]);

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
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Season Calendar</h1>
      <div style={{ marginBottom: 12 }}>
        Dim used teams for:{" "}
        <select value={entry} onChange={(e) => setEntry(e.target.value)}>
          {ENTRY_NAMES.map((n) => <option key={n} value={n}>{n || "— none —"}</option>)}
        </select>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr><th style={{ padding: 4 }}>Team</th>{weeks.map((w) => <th key={w} style={{ padding: 4 }}>W{w}</th>)}</tr>
          </thead>
          <tbody>
            {TEAMS.map((t) => {
              const dim = used.has(t);
              return (
                <tr key={t} style={{ opacity: dim ? 0.35 : 1 }}>
                  <td style={{ fontWeight: 700, padding: 4 }}>{t}</td>
                  {weeks.map((w) => {
                    const c = cell.get(t)?.get(w);
                    return (
                      <td key={w} style={{
                        padding: 4, textAlign: "center", border: "1px solid #eee",
                        background: c ? (c.home ? "#e8f5e9" : "#f5f5f5") : "white",
                      }}>
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
      <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Green = home · grey = away · blank = BYE</p>
    </main>
  );
}
