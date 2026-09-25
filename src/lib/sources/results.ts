import { getCache, setCache } from "../db/cache-repo";
import { fetchWeekResults } from "./espn-schedule";
import type { GameResult, TeamAbbr } from "../types";

const KEY = "results";
const LIVE_TTL_MS = 60 * 1000;

function keyOf(r: GameResult): string {
  return `${r.week}|${r.home}|${r.away}`;
}

/** The cached result for a specific game, or null if none is recorded yet. */
export function resultForGame(
  results: GameResult[],
  week: number,
  home: TeamAbbr,
  away: TeamAbbr,
): GameResult | null {
  return results.find((r) => r.week === week && r.home === home && r.away === away) ?? null;
}

/** Merge fresh results over prior, replacing games with the same (week, home, away). */
export function mergeResults(prior: GameResult[], fresh: GameResult[]): GameResult[] {
  const map = new Map<string, GameResult>();
  for (const r of prior) map.set(keyOf(r), r);
  for (const r of fresh) map.set(keyOf(r), r);
  return [...map.values()];
}

/** True when the given week's cached results are missing, or non-final and older than the live TTL. */
export function shouldRefetch(
  results: GameResult[],
  week: number,
  fetchedAt: string | null,
  now: Date,
): boolean {
  const wk = results.filter((r) => r.week === week);
  if (wk.length === 0) return true;
  if (wk.every((r) => r.completed)) return false;
  if (!fetchedAt) return true;
  return now.getTime() - new Date(fetchedAt).getTime() > LIVE_TTL_MS;
}

/**
 * Season results, refreshing only the current week when its live window has lapsed.
 * On an empty cache, seeds every week up to `week` so past picks resolve.
 */
export async function getResultsFresh(
  week: number,
  season: number,
  now: Date = new Date(),
): Promise<GameResult[]> {
  const cached = await getCache<GameResult[]>(KEY);
  const prior = cached?.payload ?? [];
  // Clamp to the regular-season range so an empty schedule (week 1) or a
  // finished season (week 19) can't ask ESPN for a week that doesn't exist.
  const wk = Math.min(Math.max(week, 1), 18);

  if (prior.length === 0) {
    const all: GameResult[] = [];
    for (let w = 1; w <= wk; w++) {
      try {
        all.push(...(await fetchWeekResults(w, season)));
      } catch {
        // Skip weeks ESPN can't serve yet; keep seeding the rest.
      }
    }
    await setCache(KEY, all);
    return all;
  }

  if (!shouldRefetch(prior, wk, cached?.fetchedAt ?? null, now)) return prior;

  try {
    const fresh = await fetchWeekResults(wk, season);
    const merged = mergeResults(prior, fresh);
    await setCache(KEY, merged);
    return merged;
  } catch {
    return prior; // keep the last-known results if the live fetch fails
  }
}
