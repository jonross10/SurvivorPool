import type { WinProb, Recommendation, PathEntry, TeamAbbr } from "./types";
import { maxWeightAssignment } from "./matching";

export interface EngineOptions {
  safetyFloor: number; // 0..1 minimum acceptable prob for the current-week pick
}

export function recommend(
  entry: string,
  currentWeek: number,
  winProbs: WinProb[],
  opts: EngineOptions,
): Recommendation {
  const weeks = [...new Set(winProbs.map((w) => w.week))].sort((a, b) => a - b);
  const teams = [...new Set(winProbs.map((w) => w.team))];
  const probOf = new Map(winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]));

  if (weeks.length === 0 || teams.length === 0) {
    return {
      entry, week: currentWeek, pick: null, prob: 0,
      reasoning: "No available teams to pick.", greedyAlt: null, projectedPath: [],
    };
  }

  const matrix = weeks.map((wk) =>
    teams.map((tm) => {
      const p = probOf.get(`${wk}:${tm}`);
      return p === undefined ? -Infinity : Math.log(p);
    }),
  );
  const assignment = maxWeightAssignment(matrix);

  const projectedPath: PathEntry[] = [];
  for (let i = 0; i < weeks.length; i++) {
    const col = assignment[i];
    if (col >= 0) {
      const team = teams[col];
      projectedPath.push({ week: weeks[i], team, prob: probOf.get(`${weeks[i]}:${team}`)! });
    }
  }

  const currentWeekProbs = winProbs
    .filter((w) => w.week === currentWeek)
    .sort((a, b) => b.prob - a.prob);
  const greedy = currentWeekProbs[0]
    ? { team: currentWeekProbs[0].team, prob: currentWeekProbs[0].prob }
    : null;

  const optimalCurrent = projectedPath.find((p) => p.week === currentWeek) ?? null;

  let pick: TeamAbbr | null = optimalCurrent?.team ?? null;
  let prob = optimalCurrent?.prob ?? 0;
  if (optimalCurrent && optimalCurrent.prob < opts.safetyFloor) {
    const safe = currentWeekProbs.find((w) => w.prob >= opts.safetyFloor);
    if (safe) {
      pick = safe.team;
      prob = safe.prob;
    }
  }

  const saved = optimalCurrent && greedy && optimalCurrent.team !== greedy.team
    ? projectedPath.find((p) => p.team === greedy.team)
    : null;
  const reasoning = pick
    ? saved
      ? `Pick ${pick} (${pct(prob)}); saving ${saved.team} for Week ${saved.week} (${pct(saved.prob)}).`
      : `Pick ${pick} (${pct(prob)}) — best available this week.`
    : "No available teams to pick.";

  return { entry, week: currentWeek, pick, prob, reasoning, greedyAlt: greedy, projectedPath };
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
