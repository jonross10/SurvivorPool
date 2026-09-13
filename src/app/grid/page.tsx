"use client";
import { useEffect, useState } from "react";
import type { WinProb } from "@/lib/types";
import { ENTRY_NAMES } from "@/lib/entries";
import { unwrapMany } from "@/lib/jsonapi-client";

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
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Grid — {entry}</h1>
      <select value={entry} onChange={(e) => setEntry(e.target.value)}>
        {ENTRY_NAMES.map((n) => <option key={n}>{n}</option>)}
      </select>
      <table style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr><th>Team</th>{weeks.map((w) => <th key={w} style={{ padding: 4 }}>W{w}</th>)}</tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t}>
              <td style={{ fontWeight: 700, padding: 4 }}>{t}</td>
              {weeks.map((w) => {
                const c = cell.get(`${w}:${t}`);
                return (
                  <td key={w} style={{
                    padding: 4, textAlign: "center",
                    background: c ? color(c.prob) : "#f3f3f3",
                  }}>
                    {c ? `${Math.round(c.prob * 100)}%` : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
