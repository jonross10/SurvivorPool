import { fetchSeasonSchedule } from "./espn-schedule";
import { espnFpiProvider } from "./espn-fpi";
import { fetchOdds, parseOdds } from "./odds-api";
import { setCache } from "../db/cache-repo";
import type { Matchup } from "../types";

export async function ingestAll(season: number, oddsApiKey: string): Promise<void> {
  const schedule = await fetchSeasonSchedule(season);
  await setCache("schedule", schedule);

  const strengths = await espnFpiProvider.fetchStrengths(season);
  await setCache("fpi", strengths);

  const rawOdds = await fetchOdds(oddsApiKey);
  const weekLookup = buildWeekLookup(schedule);
  const odds = parseOdds(rawOdds, weekLookup);
  await setCache("odds", odds);
}

function buildWeekLookup(schedule: Matchup[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of schedule) m.set(`${s.home}|${s.away}`, s.week);
  return m;
}
