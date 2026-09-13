"use client";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";

export default function DashboardClient() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [floor, setFloor] = useState(0.6);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/recommendations?safetyFloor=${floor}`);
    const doc = await res.json();
    setRecs(unwrapMany<Recommendation>(doc));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [floor]);

  async function confirm(r: Recommendation) {
    if (!r.pick) return;
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({
        data: { type: "pick", attributes: { entry: r.entry, week: r.week, team: r.pick, winProb: r.prob } },
      }),
    });
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Pick failed");
    } else load();
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Survivor Pool — Week {recs[0]?.week ?? "?"}</h1>
      <label>Safety floor: {Math.round(floor * 100)}%{" "}
        <input type="range" min={0} max={0.95} step={0.05}
          value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
      </label>
      {loading && <p>Loading…</p>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        {recs.map((r) => (
          <div key={r.entry} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
            <h2 style={{ margin: 0 }}>{r.entry}</h2>
            <p style={{ fontSize: 24, fontWeight: 700 }}>
              {r.pick ?? "—"} {r.pick && <span>({Math.round(r.prob * 100)}%)</span>}
            </p>
            <p style={{ color: "#555" }}>{r.reasoning}</p>
            {r.greedyAlt && r.greedyAlt.team !== r.pick && (
              <p style={{ fontSize: 12, color: "#888" }}>
                Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
              </p>
            )}
            <button onClick={() => confirm(r)} disabled={!r.pick}>Confirm pick</button>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>
        <a href="/grid">Grid view</a> · <a href="/log">Pick log</a>
      </p>
    </main>
  );
}
