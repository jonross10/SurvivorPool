import { getCache } from "./db/cache-repo";
import { getEntryStatuses } from "./entry-status";
import { buildRecommendations } from "./recommendations";
import { buildGameViews } from "./game-views";
import { getResultsFresh, resultForGame } from "./sources/results";
import { currentWeek, resolveSeason } from "./week";
import { KLAVIYO_BASE as BASE, klaviyoHeaders as headers } from "./klaviyo-http";
import type { Matchup, TeamStrength, MoneylineGame, GameView, GameResult } from "./types";

const DATA_SOURCE_ID = "01M3SAT9SKVNGGC852C1S0RVDV";
const ENTRY_TYPE_ID = "01M3SAVFMNNS65MKS94CFQKX1M";
const PICK_TYPE_ID = "01M3SAWVZSM1MQR1PRP9YQ3QBK";

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

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const;

/**
 * Resolve an entry's recurring pick deadline ({day 0=Sun..6=Sat, time "HH:MM"} in US
 * Eastern) to the next upcoming concrete UTC ISO timestamp. Returns null if unset.
 */
export function weeklyDeadlineISO(pickDue: { day: number; time: string } | null | undefined, now: Date): string | null {
  if (!pickDue) return null;
  const [hh, mm] = pickDue.time.split(":").map(Number);
  const TZ = "America/New_York";
  const parts = (date: Date) => {
    const m: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(date)) m[p.type] = p.value;
    return m;
  };
  const tzOffsetMs = (date: Date) => {
    const m = parts(date);
    return Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second) - date.getTime();
  };
  for (let i = 0; i < 8; i++) {
    const probe = new Date(now.getTime() + i * 86400000);
    const m = parts(probe);
    if (WEEKDAY[m.weekday as keyof typeof WEEKDAY] !== pickDue.day) continue;
    const utcGuess = Date.UTC(+m.year, +m.month - 1, +m.day, hh, mm, 0);
    const instant = utcGuess - tzOffsetMs(new Date(utcGuess));
    if (instant >= now.getTime() - 60000) return new Date(instant).toISOString();
  }
  return null;
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
      pick_due: weeklyDeadlineISO(e.settings.pick_due, now),
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

/**
 * Delete an entry's Klaviyo records (the Entry record + one Pick record per given week).
 * Call with the entry's pick weeks captured BEFORE the DB rows are removed.
 */
export async function deleteEntryRecords(entryId: string, weeks: number[]): Promise<void> {
  const ids = [
    `${ENTRY_TYPE_ID}:::${entryId}`,
    ...weeks.map((w) => `${PICK_TYPE_ID}:::${entryId}:${w}`),
  ];
  const res = await fetch(`${BASE}/object-record-bulk-delete-jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "object-record-bulk-delete-job",
        relationships: { "object-records": { data: ids.map((id) => ({ type: "object-record", id })) } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo record delete failed: ${res.status} ${await res.text()}`);
}

/** Fire-and-forget delete used by the entry-delete route. */
export function deleteEntryRecordsInBackground(entryId: string, weeks: number[]): void {
  deleteEntryRecords(entryId, weeks).catch((e) =>
    console.error("[klaviyo-objects] delete failed:", e instanceof Error ? e.message : e),
  );
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
