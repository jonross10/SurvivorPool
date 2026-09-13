"use client";
import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import TeamLogo from "@/components/TeamLogo";
import WinProbPill from "@/components/WinProbPill";

type Rec = Recommendation & { currentPick?: string | null };

interface Freshness { fetchedAt: string | null; canRefreshNow: boolean; remainingMs: number }

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function DashboardClient() {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [floor, setFloor] = useState(0.6);
  const [loading, setLoading] = useState(true);
  const [freshness, setFreshness] = useState<Freshness>({ fetchedAt: null, canRefreshNow: true, remainingMs: 0 });
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/recommendations?safetyFloor=${floor}`);
    const doc = await res.json();
    setRecs(unwrapMany<Rec>(doc));
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [floor]);

  async function loadFreshness() {
    const doc = await (await fetch("/api/refresh")).json();
    setFreshness(doc.meta ?? { fetchedAt: null, canRefreshNow: true, remainingMs: 0 });
  }
  useEffect(() => { loadFreshness(); }, []);

  async function refreshStats() {
    setRefreshing(true);
    const res = await fetch("/api/refresh", { method: "POST" });
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Refresh failed");
    } else {
      await load();
    }
    await loadFreshness();
    setRefreshing(false);
  }

  async function confirm(r: Rec) {
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

  async function undo(r: Rec) {
    await fetch("/api/pick", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry: r.entry, week: r.week } } }),
    });
    load();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Survivor Pool <span className="text-slate-400">— Week {recs[0]?.week ?? "?"}</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Updated {timeAgo(freshness.fetchedAt)}</span>
          <button
            onClick={refreshStats}
            disabled={refreshing || !freshness.canRefreshNow}
            title={
              freshness.canRefreshNow
                ? "Fetch the latest odds & rankings"
                : `Available again in ${Math.ceil(freshness.remainingMs / 60000)}m`
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh stats"}
          </button>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-500">
        Safety floor
        <input
          type="range" min={0} max={0.95} step={0.05}
          value={floor} onChange={(e) => setFloor(Number(e.target.value))}
          className="accent-emerald-600"
        />
        <span className="w-9 font-semibold text-slate-700">{Math.round(floor * 100)}%</span>
      </label>

      {loading && <p className="mt-4 text-slate-400">Loading…</p>}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {recs.map((r) => (
          <div key={r.entry} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold">{r.entry}</h2>

            {r.currentPick ? (
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <TeamLogo abbr={r.currentPick} size={40} />
                  <span className="text-2xl font-bold">{r.currentPick}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    ✓ picked
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">Locked in for Week {r.week}.</p>
                <button onClick={() => undo(r)} className="mt-3 text-sm text-slate-500 underline">
                  Undo pick
                </button>
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-xs uppercase tracking-wide text-slate-400">Suggested</p>
                <div className="mt-1 flex items-center gap-3">
                  {r.pick && <TeamLogo abbr={r.pick} size={40} />}
                  <span className="text-2xl font-bold">{r.pick ?? "—"}</span>
                  {r.pick && <WinProbPill prob={r.prob} />}
                </div>
                <p className="mt-2 text-sm text-slate-600">{r.reasoning}</p>
                {r.greedyAlt && r.greedyAlt.team !== r.pick && (
                  <p className="mt-1 text-xs text-slate-400">
                    Greedy alt: {r.greedyAlt.team} ({Math.round(r.greedyAlt.prob * 100)}%)
                  </p>
                )}
                <button
                  onClick={() => confirm(r)}
                  disabled={!r.pick}
                  className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  Confirm pick
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
