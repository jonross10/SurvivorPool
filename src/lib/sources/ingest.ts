import { fetchSeasonSchedule } from "./espn-schedule";
import { espnFpiProvider } from "./espn-fpi";
import { fetchOdds, parseOdds } from "./odds-api";
import { fetchInjuries } from "./injuries";
import { setCache } from "../db/cache-repo";
import type { Matchup } from "../types";

export interface IngestResult {
  schedule: number;
  fpi: number;
  odds: number | null;      // games with odds cached, or null if the odds refresh was skipped
  oddsError: string | null; // failure message when the odds refresh was skipped
  injuries: number | null;  // notable injuries cached, or null if that refresh was skipped
}

export async function ingestAll(season: number, oddsApiKey: string): Promise<IngestResult> {
  // Schedule and FPI are core — recommendations can't work without them, so a
  // failure here should surface as a failed refresh.
  const schedule = await fetchSeasonSchedule(season);
  await setCache("schedule", schedule);

  const strengths = await espnFpiProvider.fetchStrengths(season);
  await setCache("fpi", strengths);

  // Odds are an enhancement: win probs fall back to FPI when a line is missing.
  // A bad key or an exhausted quota must not fail the whole refresh (which the
  // cron depends on), so odds are refreshed best-effort and the prior odds cache
  // is left in place on failure.
  let oddsCount: number | null = null;
  let oddsError: string | null = null;
  try {
    const rawOdds = await fetchOdds(oddsApiKey);
    const weekLookup = buildWeekLookup(schedule);
    const odds = parseOdds(rawOdds, weekLookup);
    await setCache("odds", odds);
    oddsCount = odds.length;
  } catch (e) {
    oddsError = e instanceof Error ? e.message : String(e);
    console.error("[ingest] odds refresh failed, keeping prior odds:", oddsError);
  }

  // Injuries are also an enhancement (daily baseline; reads refresh them near kickoff). Best-effort.
  let injuriesCount: number | null = null;
  try {
    const injuries = await fetchInjuries();
    await setCache("injuries", injuries);
    injuriesCount = Object.values(injuries).reduce((n, list) => n + list.length, 0);
  } catch (e) {
    console.error("[ingest] injuries refresh failed, keeping prior injuries:", e instanceof Error ? e.message : e);
  }

  return { schedule: schedule.length, fpi: strengths.length, odds: oddsCount, oddsError, injuries: injuriesCount };
}

function buildWeekLookup(schedule: Matchup[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of schedule) m.set(`${s.home}|${s.away}`, s.week);
  return m;
}
