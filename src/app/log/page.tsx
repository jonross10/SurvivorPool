"use client";
import { useEffect, useState } from "react";

type Log = Record<string, { week: number; team: string }[]>;

export default function LogPage() {
  const [log, setLog] = useState<Log>({});
  useEffect(() => {
    fetch("/api/log").then((r) => r.json()).then((d) => setLog(d.log));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Pick Log</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {Object.entries(log).map(([entry, picks]) => (
          <div key={entry}>
            <h3>{entry}</h3>
            <ol>
              {picks.map((p) => <li key={p.week}>W{p.week}: {p.team}</li>)}
            </ol>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}><a href="/">← Dashboard</a></p>
    </main>
  );
}
