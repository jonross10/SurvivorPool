"use client";
import { useEffect, useState } from "react";
import type { GameView, Recommendation, WinProb } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import TeamLogo from "@/components/TeamLogo";
import WinProbPill from "@/components/WinProbPill";
import { useRanks } from "@/components/use-ranks";

type Rec = Recommendation & {
  currentPick?: string | null;
  entryId?: string;
  picksByWeek?: Record<number, string>;
  eliminated?: boolean;
  eliminatedWeek?: number | null;
  settings?: { ties_survive?: boolean };
  resultsByWeek?: Record<number, {
    week: number; team: string; outcome: "won" | "lost" | "tie" | "pending" | "live";
    teamScore: number | null; oppScore: number | null; opponent: string | null; statusDetail: string;
  }>;
};

function cellClasses(outcome: string | undefined, isCurrent: boolean, eliminated: boolean): string {
  // Green means a win — never "the current week".
  if (outcome === "won" || outcome === "tie") return "border-emerald-400 bg-emerald-50";
  if (outcome === "lost") return "border-red-400 bg-red-50";
  if (outcome === "live") return "border-amber-400 bg-amber-50";
  // Not yet played: highlight the current week (unless the entry is out) in blue.
  if (isCurrent && !eliminated) return "border-blue-300 bg-blue-50";
  return "border-slate-100";
}

function fmtSpread(s: number | null): string {
  if (s === null) return "";
  if (s === 0) return "PK";
  return s > 0 ? `+${s}` : `${s}`;
}
function fmtOdds(o: number | null): string {
  if (o === null) return "";
  return o > 0 ? `+${o}` : `${o}`;
}

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
  const ranks = useRanks();

  // Week-pick modal: choose/swap a team for one entry + week.
  const [pickModal, setPickModal] = useState<{ entry: string; week: number; current?: string } | null>(null);
  const [modalWps, setModalWps] = useState<WinProb[]>([]);

  async function openPickModal(r: Rec, week: number) {
    setPickModal({ entry: r.entry, week, current: r.picksByWeek?.[week] });
    setModalWps([]);
    const doc = await (await fetch(`/api/grid?filter[entry]=${encodeURIComponent(r.entry)}`)).json();
    setModalWps(unwrapMany<WinProb>(doc));
  }

  async function pickForWeek(entry: string, week: number, team: string, prob: number) {
    // Swap: if the week already has a different pick, remove it first (UNIQUE week).
    if (pickModal?.current && pickModal.current !== team) {
      await fetch("/api/pick", {
        method: "DELETE",
        headers: { "content-type": "application/vnd.api+json" },
        body: JSON.stringify({ data: { type: "pick", attributes: { entry, week } } }),
      });
    }
    const res = await fetch("/api/pick", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week, team, winProb: prob } } }),
    });
    if (!res.ok) alert((await res.json()).errors?.[0]?.detail ?? "Pick failed");
    setPickModal(null);
    load();
  }

  async function clearWeek(entry: string, week: number) {
    await fetch("/api/pick", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick", attributes: { entry, week } } }),
    });
    setPickModal(null);
    load();
  }

  async function load() {
    setLoading(true);
    const [recDoc, entriesDoc, matchupsDoc] = await Promise.all([
      fetch(`/api/recommendations?safetyFloor=${floor}`).then((r) => r.json()),
      fetch(`/api/entries`).then((r) => r.json()),
      fetch(`/api/matchups`).then((r) => r.json()),
    ]);
    setWeekGames(unwrapMany<GameView>(matchupsDoc));
    const settingsByName: Record<string, { ties_survive?: boolean }> = Object.fromEntries(
      (entriesDoc.data ?? []).map((d: { attributes: { name: string; settings?: { ties_survive?: boolean } } }) =>
        [d.attributes.name, d.attributes.settings ?? {}]),
    );
    const recsWithId: Rec[] = (recDoc.data ?? []).map(
      (d: { id: string; attributes: Rec }) => ({
        ...d.attributes,
        entryId: d.id,
        settings: settingsByName[d.attributes.entry] ?? {},
      }),
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
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Refresh failed");
    } else {
      await load();
    }
    await loadFreshness();
    setRefreshing(false);
  }

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  async function addEntry() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "entry", attributes: { name } } }),
    });
    if (!res.ok) {
      const doc = await res.json();
      alert(doc.errors?.[0]?.detail ?? "Could not add entry");
      return;
    }
    setNewName("");
    setAdding(false);
    load();
  }

  async function removeEntry(r: Rec) {
    if (!window.confirm(`Delete ${r.entry} and all their picks?`)) return;
    await fetch(`/api/entries/${r.entryId ?? ""}`, { method: "DELETE" });
    load();
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

  async function setTiesSurvive(r: Rec, value: boolean) {
    await fetch(`/api/entries/${r.entryId ?? ""}`, {
      method: "PATCH",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { attributes: { settings: { ...(r.settings ?? {}), ties_survive: value } } } }),
    });
    load();
  }

  async function overrideWeek(entry: string, week: number, outcome: "survived" | "out" | "revived") {
    await fetch("/api/pick-override", {
      method: "POST",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { type: "pick-override", attributes: { entry, week, outcome } } }),
    });
    setPickModal(null);
    load();
  }

  async function reviveEntry(r: Rec) {
    if (!r.eliminatedWeek) return;
    if (!window.confirm(
      `Revive ${r.entry}? Their Week ${r.eliminatedWeek} loss stays on the record, but they'll be marked back in (buy-back).`,
    )) return;
    await overrideWeek(r.entry, r.eliminatedWeek, "revived");
  }

  // Current-week odds line (win %, spread, moneyline) for a team, from the matchups feed.
  function lineFor(team: string | null | undefined): { prob: number; spread: number | null; odds: number | null } | null {
    if (!team) return null;
    const g = weekGames.find((x) => x.home === team || x.away === team);
    if (!g) return null;
    const home = g.home === team;
    return {
      prob: home ? g.homeProb : g.awayProb,
      spread: home ? g.homeSpread : (g.homeSpread === null ? null : -g.homeSpread),
      odds: home ? g.homeOdds : g.awayOdds,
    };
  }

  async function clearOverrideWeek(entry: string, week: number) {
    await fetch("/api/pick-override", {
      method: "DELETE",
      headers: { "content-type": "application/vnd.api+json" },
      body: JSON.stringify({ data: { attributes: { entry, week } } }),
    });
    setPickModal(null);
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
          <div
            key={r.entry}
            className={`rounded-xl border bg-white p-4 shadow-sm ${
              r.eliminated ? "border-red-300 bg-red-50/40 opacity-80" : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-bold ${r.eliminated ? "text-red-700" : ""}`}>{r.entry}</h2>
              <div className="flex items-center gap-2">
                <label
                  className="flex items-center gap-1 text-[11px] text-slate-500"
                  title="A tie counts as surviving in this entry's league"
                >
                  <input
                    type="checkbox"
                    checked={r.settings?.ties_survive ?? true}
                    onChange={(e) => setTiesSurvive(r, e.target.checked)}
                    className="accent-emerald-600"
                  />
                  tie=safe
                </label>
                <button
                  onClick={() => removeEntry(r)}
                  title="Delete entry"
                  className="text-slate-300 transition-colors hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            </div>

            {r.eliminated ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Eliminated{r.eliminatedWeek ? ` — Week ${r.eliminatedWeek}` : ""}
                </span>
                {r.eliminatedWeek && (
                  <button
                    onClick={() => reviveEntry(r)}
                    title="Buy-back: keep the loss on record but mark them back in"
                    className="text-xs font-medium text-emerald-700 underline"
                  >
                    Revive entry
                  </button>
                )}
              </div>
            ) : r.currentPick ? (
              <div className="mt-2">
                <div className="flex items-center gap-3">
                  <TeamLogo abbr={r.currentPick} size={40} />
                  <span className="text-2xl font-bold">{r.currentPick}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    ✓ picked
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">Locked in for Week {r.week}.</p>
                {(() => {
                  const ln = lineFor(r.currentPick);
                  return ln ? (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{Math.round(ln.prob * 100)}%</span> to win
                      {ln.spread !== null && ` · ${fmtSpread(ln.spread)}`}
                      {ln.odds !== null && ` · ${fmtOdds(ln.odds)}`}
                    </p>
                  ) : null;
                })()}
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
                {(() => {
                  const ln = lineFor(r.pick);
                  return ln && (ln.spread !== null || ln.odds !== null) ? (
                    <p className="mt-1 text-xs text-slate-400">
                      {[ln.spread !== null ? fmtSpread(ln.spread) : null, ln.odds !== null ? fmtOdds(ln.odds) : null]
                        .filter(Boolean).join(" · ")}
                    </p>
                  ) : null;
                })()}
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

            {/* Season timeline — click a week to pick/swap that entry's team */}
            {weeks.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {weeks.map((w) => {
                    const team = r.picksByWeek?.[w];
                    const isCurrent = w === r.week;
                    const rv = r.resultsByWeek?.[w];
                    return (
                      <button
                        key={w}
                        onClick={() => openPickModal(r, w)}
                        title={rv?.statusDetail || `Pick ${r.entry}'s Week ${w} team`}
                        className={`flex w-[46px] shrink-0 flex-col items-center rounded-lg border px-1 py-1 transition-colors hover:border-slate-400 hover:bg-slate-50 ${cellClasses(rv?.outcome, isCurrent, !!r.eliminated)}`}
                      >
                        <span className="text-[10px] text-slate-400">W{w}</span>
                        {team ? (
                          <>
                            <TeamLogo abbr={team} size={20} />
                            <span className="text-[10px] font-semibold">{team}</span>
                            {/* Only show a score once the game has actually played (not 0–0 pre-kickoff). */}
                            {rv && rv.outcome !== "pending" && rv.teamScore != null && rv.oppScore != null && (
                              <span className="text-[9px] tabular-nums text-slate-500">
                                {rv.teamScore}–{rv.oppScore}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="py-1 text-slate-300">+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {pickModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPickModal(null)}
        >
          <div
            className="flex max-h-[80vh] w-96 flex-col rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{pickModal.entry} — Week {pickModal.week}</h3>
              <button onClick={() => setPickModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {pickModal.current && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                <span className="flex items-center gap-2">
                  <TeamLogo abbr={pickModal.current} size={22} />
                  <span className="font-semibold">{pickModal.current}</span>
                  <span className="text-xs text-emerald-700">current pick</span>
                </span>
                <button
                  onClick={() => clearWeek(pickModal.entry, pickModal.week)}
                  className="text-sm text-red-500 underline"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">Result override:</span>
              <button
                onClick={() => overrideWeek(pickModal.entry, pickModal.week, "survived")}
                className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700 hover:bg-emerald-200"
              >
                Mark survived
              </button>
              <button
                onClick={() => overrideWeek(pickModal.entry, pickModal.week, "out")}
                className="rounded bg-red-100 px-2 py-1 font-medium text-red-700 hover:bg-red-200"
              >
                Mark out
              </button>
              <button
                onClick={() => clearOverrideWeek(pickModal.entry, pickModal.week)}
                className="rounded px-2 py-1 text-slate-500 underline"
              >
                Clear
              </button>
            </div>

            <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">
              Available teams · safest first
            </p>
            <div className="mt-1 flex-1 overflow-y-auto">
              {modalWps.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
              ) : (
                modalWps
                  .filter((w) => w.week === pickModal.week)
                  .sort((a, b) => b.prob - a.prob)
                  .map((w) => (
                    <button
                      key={w.team}
                      onClick={() => pickForWeek(pickModal.entry, pickModal.week, w.team, w.prob)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className="flex items-center gap-2">
                        <TeamLogo abbr={w.team} size={22} />
                        <span className="font-semibold">{w.team}</span>
                        {ranks[w.team] !== undefined && (
                          <span className="text-[10px] font-medium text-slate-400">#{ranks[w.team]}</span>
                        )}
                        <span className="text-xs text-slate-400">{w.home ? "vs" : "@"} {w.opponent}</span>
                      </span>
                      <WinProbPill prob={w.prob} />
                    </button>
                  ))
              )}
              {modalWps.length > 0 && modalWps.filter((w) => w.week === pickModal.week).length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No available teams this week (all on bye or used).</p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
