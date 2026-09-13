"use client";
import { useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";

interface PickAttrs { entry: string; week: number; team: string }

export default function LogPage() {
  const [picks, setPicks] = useState<PickAttrs[]>([]);
  useEffect(() => {
    fetch("/api/log").then((r) => r.json()).then((doc) => setPicks(unwrapMany<PickAttrs>(doc)));
  }, []);

  const byEntry = new Map<string, PickAttrs[]>();
  for (const p of picks) {
    if (!byEntry.has(p.entry)) byEntry.set(p.entry, []);
    byEntry.get(p.entry)!.push(p);
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Pick Log</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
        {[...byEntry.entries()].map(([entry, ps]) => (
          <div key={entry}>
            <h3>{entry}</h3>
            <ol>
              {ps.sort((a, b) => a.week - b.week).map((p) => <li key={p.week}>W{p.week}: {p.team}</li>)}
            </ol>
          </div>
        ))}
      </div>
    </main>
  );
}
