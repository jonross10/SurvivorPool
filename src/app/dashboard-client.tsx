"use client";
import { useEffect, useState } from "react";
import type { GameView } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import {
  recordPick, removePick, setPickOverride,
  updateEntrySettings, createEntry, deleteEntry, errorDetail,
} from "@/lib/api-client";
import EntryCard, { type Rec } from "@/components/EntryCard";
import { useRanks } from "@/components/use-ranks";
import { usePickModal } from "@/components/use-pick-modal";

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
  const [weeks, setWeeks] = useState<number[]>([]);
  const [weekGames, setWeekGames] = useState<GameView[]>([]);
  const [floor, setFloor] = useState(0.6);
  const [loading, setLoading] = useState(true);
  const [freshness, setFreshness] = useState<Freshness>({ fetchedAt: null, canRefreshNow: true, remainingMs: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const ranks = useRanks();
  const modal = usePickModal(load);

  async function load() {
    setLoading(true);
    const [recDoc, entriesDoc, matchupsDoc] = await Promise.all([
      fetch(`/api/recommendations?safetyFloor=${floor}`).then((r) => r.json()),
      fetch(`/api/entries`).then((r) => r.json()),
      fetch(`/api/matchups`).then((r) => r.json()),
    ]);
    setWeekGames(unwrapMany<GameView>(matchupsDoc));
    const settingsByName: Record<string, { ties_survive?: boolean; pool?: string }> = Object.fromEntries(
      (entriesDoc.data ?? []).map((d: { attributes: { name: string; settings?: { ties_survive?: boolean; pool?: string } } }) =>
        [d.attributes.name, d.attributes.settings ?? {}]),
    );
    const recsWithId: Rec[] = (recDoc.data ?? []).map(
      (d: { id: string; attributes: Rec }) => ({ ...d.attributes, entryId: d.id, settings: settingsByName[d.attributes.entry] ?? {} }),
    );
    setRecs(recsWithId);
    setWeeks(recDoc.meta?.weeks ?? []);
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
    if (!res.ok) alert(await errorDetail(res, "Refresh failed"));
    else await load();
    await loadFreshness();
    setRefreshing(false);
  }

  async function addEntry() {
    const name = newName.trim();
    if (!name) return;
    const res = await createEntry(name);
    if (!res.ok) { alert(await errorDetail(res, "Could not add entry")); return; }
    setNewName("");
    setAdding(false);
    load();
  }

  async function removeEntry(r: Rec) {
    if (!window.confirm(`Delete ${r.entry} and all their picks?`)) return;
    await deleteEntry(r.entryId ?? "");
    load();
  }

  async function confirm(r: Rec) {
    if (!r.pick) return;
    const res = await recordPick(r.entry, r.week, r.pick, r.prob);
    if (!res.ok) alert(await errorDetail(res, "Pick failed"));
    else load();
  }

  async function undo(r: Rec) {
    await removePick(r.entry, r.week);
    load();
  }

  async function setTiesSurvive(r: Rec, value: boolean) {
    await updateEntrySettings(r.entryId ?? "", { ...(r.settings ?? {}), ties_survive: value });
    load();
  }

  async function setPool(r: Rec, pool: string) {
    await updateEntrySettings(r.entryId ?? "", { ...(r.settings ?? {}), pool });
    load();
  }

  async function reviveEntry(r: Rec) {
    if (!r.eliminatedWeek) return;
    if (!window.confirm(
      `Revive ${r.entry}? Their Week ${r.eliminatedWeek} loss stays on the record, but they'll be marked back in (buy-back).`,
    )) return;
    await setPickOverride(r.entry, r.eliminatedWeek, "revived");
    load();
  }

  const currentWk = recs[0]?.week ?? null;
  const alive = recs.filter((r) => !r.eliminated);
  const pickedThisWeek = alive.filter((r) => r.currentPick);
  const toPick = alive.length - pickedThisWeek.length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Survivor Pool <span className="text-slate-400">— Week {currentWk ?? "?"}</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Updated {timeAgo(freshness.fetchedAt)}</span>
          {adding ? (
            <span className="flex items-center gap-1">
              <input
                autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
                placeholder="Name"
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <button onClick={addEntry} className="rounded-lg bg-emerald-600 px-2 py-1 text-sm font-medium text-white hover:bg-emerald-700">Add</button>
              <button onClick={() => { setAdding(false); setNewName(""); }} className="px-1 text-sm text-slate-500">✕</button>
            </span>
          ) : (
            <button onClick={() => setAdding(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">+ Add entry</button>
          )}
          <button
            onClick={refreshStats}
            disabled={refreshing || !freshness.canRefreshNow}
            title={freshness.canRefreshNow ? "Fetch the latest odds & rankings" : `Available again in ${Math.ceil(freshness.remainingMs / 60000)}m`}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh stats"}
          </button>
        </div>
      </div>

      {recs.length > 0 && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <strong className="text-slate-900">{alive.length}/{recs.length}</strong> entries still alive
          {alive.length > 0 && currentWk !== null && (
            <>
              {" · "}
              <strong className="text-slate-900">{pickedThisWeek.length}/{alive.length}</strong> picked Week {currentWk}
              {toPick > 0 && <span className="text-amber-600"> · {toPick} still to pick</span>}
            </>
          )}
        </div>
      )}

      <label
        className="mt-3 flex items-center gap-2 text-sm text-slate-500"
        title="Won't suggest a team below this win chance for this week's pick. Higher = safer now; lower = trust the season-long plan."
      >
        Min. win chance
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
          <EntryCard
            key={r.entry}
            rec={r}
            weeks={weeks}
            ranks={ranks}
            weekGames={weekGames}
            onOpenWeek={(r, w) => modal.open(r.entry, w, r.picksByWeek?.[w])}
            onUndo={undo}
            onConfirm={confirm}
            onRevive={reviveEntry}
            onToggleTies={setTiesSurvive}
            onSetPool={setPool}
            onRemove={removeEntry}
          />
        ))}
      </div>

      {modal.render(ranks)}
    </main>
  );
}
