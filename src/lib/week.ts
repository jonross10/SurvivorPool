import type { Matchup } from "./types";

/**
 * The NFL season year for a given date. A season is labelled by its start year
 * and spans August through the following July (e.g. the 2026 season runs from
 * August 2026 to July 2027), so Aug–Dec map to the current year and Jan–Jul to
 * the previous year.
 */
export function currentSeason(now: Date): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 7 ? year : year - 1; // getUTCMonth: 0=Jan, 7=Aug
}

/** The earliest week that still has a game kicking off at or after `now`. */
export function currentWeek(schedule: Matchup[], now: Date): number {
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  for (const w of weeks) {
    const lastKickoff = Math.max(
      ...schedule.filter((m) => m.week === w).map((m) => new Date(m.kickoff).getTime()),
    );
    if (lastKickoff >= now.getTime()) return w;
  }
  return (weeks[weeks.length - 1] ?? 0) + 1;
}
