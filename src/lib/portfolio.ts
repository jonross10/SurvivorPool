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

export interface EntryPlanInput {
  entry: string;
  winProbs: WinProb[];                    // weeks >= currentWeek, excludes used teams
  lockedByWeek: Record<number, string>;   // decided weeks -> team (occupancy + skip)
}

export interface EntryPlan {
  entry: string;
  path: PathEntry[];
}

/** Best alternative win prob for an entry in a week, excluding a given team and forbidden cells. */
function nextBestProb(input: EntryPlanInput, week: number, team: string, forbidden: Set<string>): number {
  return input.winProbs
    .filter((w) => w.week === week && w.team !== team && !forbidden.has(`${week}:${w.team}`))
    .reduce((max, w) => Math.max(max, w.prob), 0);
}

/**
 * Plan all entries in one pool: each gets a season-optimal path, then collisions
 * (same team + week across entries) are resolved by letting the entry that needs it
 * most keep it (a locked pick always wins) and re-planning the others around it.
 */
export function planPortfolio(entries: EntryPlanInput[]): EntryPlan[] {
  const forbidden = new Map<string, Set<string>>(entries.map((e) => [e.entry, new Set<string>()]));
  const lockedWeeks = new Map<string, Set<number>>(
    entries.map((e) => [e.entry, new Set(Object.keys(e.lockedByWeek).map(Number))]),
  );
  const probOf = new Map(
    entries.map((e) => [e.entry, new Map(e.winProbs.map((w) => [`${w.week}:${w.team}`, w.prob]))]),
  );

  const maxIterations = entries.length * 25 + 5;
  let paths: EntryPlan[] = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    paths = entries.map((e) => ({
      entry: e.entry,
      path: planEntryPath(e.winProbs, forbidden.get(e.entry)!, lockedWeeks.get(e.entry)!),
    }));

    // Build occupancy: for each (week, team), who holds it (locked or planned).
    interface Occ { entry: string; locked: boolean; week: number; team: string }
    const occupancy = new Map<string, Occ[]>();
    for (const e of entries) {
      for (const [wStr, team] of Object.entries(e.lockedByWeek)) {
        const week = Number(wStr);
        const key = `${week}:${team}`;
        (occupancy.get(key) ?? occupancy.set(key, []).get(key)!).push({ entry: e.entry, locked: true, week, team });
      }
    }
    for (const pl of paths) {
      for (const p of pl.path) {
        const key = `${p.week}:${p.team}`;
        (occupancy.get(key) ?? occupancy.set(key, []).get(key)!).push({ entry: pl.entry, locked: false, week: p.week, team: p.team });
      }
    }

    // First collision that has at least one non-locked occupant we can bump.
    let collision: Occ[] | null = null;
    for (const occs of occupancy.values()) {
      if (occs.length >= 2 && occs.some((o) => !o.locked)) { collision = occs; break; }
    }
    if (!collision) break;

    const { week, team } = collision[0];
    // Keeper: a locked occupant, else the entry whose next-best that week is weakest.
    const lockedOcc = collision.find((o) => o.locked);
    const keeper = lockedOcc
      ? lockedOcc.entry
      : collision
          .map((o) => {
            const input = entries.find((e) => e.entry === o.entry)!;
            const cur = probOf.get(o.entry)!.get(`${week}:${team}`) ?? 0;
            const gap = cur - nextBestProb(input, week, team, forbidden.get(o.entry)!);
            return { entry: o.entry, gap };
          })
          .sort((a, b) => b.gap - a.gap)[0].entry;

    for (const o of collision) {
      if (!o.locked && o.entry !== keeper) forbidden.get(o.entry)!.add(`${week}:${team}`);
    }
  }
  return paths;
}

/** P(at least one entry still alive) at the end of each listed week (independence approximation). */
export function survivalCurve(
  plans: EntryPlan[],
  throughWeeks: number[],
): { week: number; prob: number }[] {
  return throughWeeks.map((week) => {
    const pAllOut = plans.reduce((acc, pl) => {
      const survive = pl.path
        .filter((p) => p.week <= week)
        .reduce((prod, p) => prod * p.prob, 1);
      return acc * (1 - survive);
    }, 1);
    return { week, prob: plans.length === 0 ? 0 : 1 - pAllOut };
  });
}
