import { getCache } from "./db/cache-repo";
import { getEntryStatuses } from "./entry-status";
import { buildRecommendations } from "./recommendations";
import { buildGameViews } from "./game-views";
import { getResultsFresh, resultForGame } from "./sources/results";
import { currentWeek, resolveSeason } from "./week";
import type { Matchup, TeamStrength, MoneylineGame, GameView, GameResult, Entry } from "./types";

const BASE = "https://a.klaviyo.com/api";
const DATA_SOURCE_ID = "01M3SAT9SKVNGGC852C1S0RVDV";

function headers(): Record<string, string> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error("KLAVIYO_API_KEY is not set");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: "2026-07-15",
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}

/** Push records into the shared data source (async ingest). Batches of 500. */
async function pushRecords(records: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    const body = {
      data: {
        type: "data-source-record-bulk-create-job",
        attributes: {
          "data-source-records": {
            data: batch.map((record) => ({ type: "data-source-record", attributes: { record } })),
          },
        },
        relationships: { "data-source": { data: { type: "data-source", id: DATA_SOURCE_ID } } },
      },
    };
    const res = await fetch(`${BASE}/data-source-record-bulk-create-jobs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Klaviyo record push failed: ${res.status} ${await res.text()}`);
  }
}

function pickResult(team: string, result: GameResult | null): string {
  if (!result) return "pending";
  if (result.inProgress) return "live";
  if (!result.completed) return "pending";
  if (result.winner === null) return "tie";
  return result.winner === team ? "won" : "lost";
}

/**
 * Sync one owner's entries + picks to Klaviyo custom objects. Reuses the same
 * status/recommendation/game-view computation the dashboard uses, so records reflect
 * exactly what the app shows. Records link to the owner via external_id = user id.
 */
export async function syncOwner(ownerId: string): Promise<void> {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const now = new Date();
  const week = currentWeek(schedule, now);
  const results = await getResultsFresh(week, resolveSeason());
  const statuses = await getEntryStatuses(results, ownerId);
  if (statuses.length === 0) return;

  const entryContexts = statuses.map((s) => ({
    name: s.entry.name,
    pool: (s.entry.settings.pool as string) ?? "main",
    safetyFloor: s.entry.settings.min_win_chance ?? 0.6,
    picksByWeek: s.picksByWeek,
    eliminated: s.status.eliminated,
  }));
  const recByName = new Map(
    buildRecommendations(schedule, strengths, odds, entryContexts, now).map((r) => [r.entry, r]),
  );

  const curViews = buildGameViews(schedule, strengths, odds, week);
  const earliestKickoff = curViews.map((g) => g.kickoff).filter(Boolean).sort()[0] ?? null;

  const viewsByWeek = new Map<number, GameView[]>();
  const gameViewsFor = (w: number) => {
    if (!viewsByWeek.has(w)) viewsByWeek.set(w, buildGameViews(schedule, strengths, odds, w));
    return viewsByWeek.get(w)!;
  };

  const records: Record<string, unknown>[] = [];
  for (const s of statuses) {
    const e = s.entry;
    const rec = recByName.get(e.name);
    const path = rec?.projectedPath ?? [];
    const currentPick = s.picksByWeek[week] ?? "";

    records.push({
      id: e.id,
      name: e.name,
      pool: (e.settings.pool as string) ?? "main",
      alive: !s.status.eliminated,
      eliminated_week: s.status.eliminatedWeek ?? null,
      current_week: week,
      current_pick: currentPick,
      picked_current_week: !!s.picksByWeek[week],
      pick_due: earliestKickoff,
      suggested_pick: rec?.pick ?? "",
      suggested_pick_prob: rec?.prob ?? 0,
      used_teams: Object.values(s.picksByWeek),
      projected_picks: path.map((p) => p.team),
      projected_pick_probs: path.map((p) => String(p.prob)),
      ties_survive: e.settings.ties_survive ?? true,
      min_win_chance: e.settings.min_win_chance ?? 0.6,
      owner_external_id: e.ownerId,
    });

    for (const [wStr, team] of Object.entries(s.picksByWeek)) {
      const w = Number(wStr);
      const gv = gameViewsFor(w).find((g) => g.home === team || g.away === team) ?? null;
      const result = gv ? resultForGame(results, w, gv.home, gv.away) : null;
      const isHome = gv?.home === team;
      records.push({
        id: `${e.id}:${w}`,
        entry_id: e.id,
        entry_name: e.name,
        week: w,
        team,
        win_prob: gv ? (isHome ? gv.homeProb : gv.awayProb) : 0,
        result: pickResult(team, result),
        home_team: gv?.home ?? "",
        away_team: gv?.away ?? "",
        home_score: result?.homeScore ?? null,
        away_score: result?.awayScore ?? null,
        game_status: result ? (result.completed ? "final" : result.inProgress ? "live" : "pre") : "pre",
        kickoff: gv?.kickoff ?? null,
        is_home: !!isHome,
        owner_external_id: e.ownerId,
      });
    }
  }

  await pushRecords(records);
}

/** Fire-and-forget sync used by write routes — never blocks or throws into the request. */
export function syncOwnerInBackground(ownerId: string): void {
  syncOwner(ownerId).catch((e) => console.error("[klaviyo-objects] sync failed:", e instanceof Error ? e.message : e));
}

/** Sync every owner (nightly reconcile). */
export async function syncAllOwners(ownerIds: string[]): Promise<void> {
  for (const id of ownerIds) {
    try {
      await syncOwner(id);
    } catch (e) {
      console.error("[klaviyo-objects] owner sync failed", id, e instanceof Error ? e.message : e);
    }
  }
}
