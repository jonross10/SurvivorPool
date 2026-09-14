import { getCache, setCache } from "../db/cache-repo";
import { fetchWeekResults } from "./espn-schedule";
import type { GameResult } from "../types";

const KEY = "results";
const LIVE_TTL_MS = 60 * 1000;

function keyOf(r: GameResult): string {
  return `${r.week}|${r.home}|${r.away}`;
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

  if (prior.length === 0) {
    const all: GameResult[] = [];
    for (let w = 1; w <= week; w++) all.push(...(await fetchWeekResults(w, season)));
    await setCache(KEY, all);
    return all;
  }

  if (!shouldRefetch(prior, week, cached?.fetchedAt ?? null, now)) return prior;

  const fresh = await fetchWeekResults(week, season);
  const merged = mergeResults(prior, fresh);
  await setCache(KEY, merged);
  return merged;
}
