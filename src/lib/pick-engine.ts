import type { WinProb, Recommendation, PathEntry, TeamAbbr } from "./types";
import { maxWeightAssignment } from "./matching";

export interface EngineOptions {
  safetyFloor: number; // 0..1 minimum acceptable prob for the current-week pick
}

/** Season-optimal one-team-per-week assignment (maximizes the product of win probs). */
export function optimalPath(winProbs: WinProb[]): PathEntry[] {
  const weeks = [...new Set(winProbs.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));
  if (weeks.length === 0 || teams.length === 0) return [];

  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
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

/** Derive the current-week pick (with safety-floor override) and reasoning from a path. */
export function recommendFromPath(
  entry: string,
  currentWeek: number,
  path: PathEntry[],
  winProbs: WinProb[],
  opts: EngineOptions,
  takenThisWeek: Set<TeamAbbr> = new Set(),
): Recommendation {
  const currentWeekProbs = winProbs
    .filter((w) => w.week === currentWeek)
    .sort((a, b) => b.prob - a.prob);
  const greedy = currentWeekProbs[0]
    ? { team: currentWeekProbs[0].team, prob: currentWeekProbs[0].prob }
    : null;

  const optimalCurrent = path.find((p) => p.week === currentWeek) ?? null;
  let pick: TeamAbbr | null = optimalCurrent?.team ?? null;
  let prob = optimalCurrent?.prob ?? 0;
  if (optimalCurrent && optimalCurrent.prob < opts.safetyFloor) {
    // Swap to the safest team clearing the floor that another pool entry hasn't
    // already taken this week, so the floor override doesn't undo diversification.
    const safe = currentWeekProbs.find((w) => w.prob >= opts.safetyFloor && !takenThisWeek.has(w.team));
    if (safe) { pick = safe.team; prob = safe.prob; }
  }
  if (!pick) {
    return { entry, week: currentWeek, pick: null, prob: 0, reasoning: "No available teams to pick.", greedyAlt: greedy, projectedPath: path };
  }

  const floorOverride = optimalCurrent !== null && pick !== optimalCurrent.team;
  const saved =
    !floorOverride && optimalCurrent && greedy && optimalCurrent.team !== greedy.team
      ? path.find((p) => p.team === greedy.team)
      : null;

  let reasoning: string;
  if (floorOverride) {
    reasoning =
      `Pick ${pick} (${pct(prob)}) — safety-floor override; optimal ${optimalCurrent!.team} ` +
      `(${pct(optimalCurrent!.prob)}) was below the ${pct(opts.safetyFloor)} floor.`;
  } else if (saved) {
    reasoning = `Pick ${pick} (${pct(prob)}); saving ${saved.team} for Week ${saved.week} (${pct(saved.prob)}).`;
  } else {
    reasoning = `Pick ${pick} (${pct(prob)}) — best available this week.`;
  }
  return { entry, week: currentWeek, pick, prob, reasoning, greedyAlt: greedy, projectedPath: path };
}

export function recommend(
  entry: string,
  currentWeek: number,
  winProbs: WinProb[],
  opts: EngineOptions,
): Recommendation {
  const path = optimalPath(winProbs);
  if (path.length === 0) {
    return { entry, week: currentWeek, pick: null, prob: 0, reasoning: "No available teams to pick.", greedyAlt: null, projectedPath: [] };
  }
  return recommendFromPath(entry, currentWeek, path, winProbs, opts);
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
