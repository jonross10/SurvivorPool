import type { PathEntry, WinProb } from "./types";
import { maxWeightAssignment } from "./matching";

/**
 * Season-optimal path for one entry over its open (non-locked) weeks, excluding
 * any forbidden `${week}:${team}` cells. Locked weeks are already decided and are
 * left out of the plan.
 */
export function planEntryPath(
  winProbs: WinProb[],
  forbidden: Set<string>,
  lockedWeeks: Set<number>,
): PathEntry[] {
  const weeks = [...new Set(winProbs.map((w) => w.week))]
    .filter((w) => !lockedWeeks.has(w))
    .sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));
  if (weeks.length === 0 || teams.length === 0) return [];

  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
      if (forbidden.has(`${wk}:${tm}`)) return -Infinity;
      const p = probOf.get(`${wk}:${tm}`);
      return p === undefined ? -Infinity : Math.log(p);
    }),
  );
  const assignment = maxWeightAssignment(matrix);
  const path: PathEntry[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const col = assignment[i];
    if (col >= 0) {
      const team = teams[col];
      path.push({ week: weeks[i], team, prob: probOf.get(`${weeks[i]}:${team}`)! });
    }
  }
  return path;
}
