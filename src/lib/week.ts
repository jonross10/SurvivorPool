import type { Matchup } from "./types";

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
