import { getCache } from "./db/cache-repo";
import { buildGameViews } from "./game-views";
import { getAllPicks, setPregameProb } from "./db/picks-repo";
import type { GameView, Matchup, MoneylineGame, TeamStrength } from "./types";

async function cachedInputs() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  return { schedule, strengths, odds };
}

function teamProb(views: GameView[], team: string): number | null {
  const g = views.find((x) => x.home === team || x.away === team);
  if (!g) return null;
  return g.home === team ? g.homeProb : g.awayProb;
}

/** Current win probability for a team in a given week (odds when posted, else FPI). */
export async function winProbFor(week: number, team: string): Promise<number | null> {
  const { schedule, strengths, odds } = await cachedInputs();
  return teamProb(buildGameViews(schedule, strengths, odds, week), team);
}

/**
 * Refresh `win_prob_pregame` for every pick whose game hasn't kicked off yet, so
 * each pick keeps the freshest pre-kickoff probability. Games already started are
 * left untouched (the column then holds the last value seen before kickoff).
 * Returns the number of picks updated. Call after a stats refresh.
 */
export async function snapshotPregameProbs(now: Date = new Date()): Promise<number> {
  const { schedule, strengths, odds } = await cachedInputs();
  const kickoff = new Map<string, string>();
  for (const m of schedule) {
    kickoff.set(`${m.week}|${m.home}`, m.kickoff);
    kickoff.set(`${m.week}|${m.away}`, m.kickoff);
  }
  const viewsByWeek = new Map<number, GameView[]>();
  const views = (w: number) => {
    if (!viewsByWeek.has(w)) viewsByWeek.set(w, buildGameViews(schedule, strengths, odds, w));
    return viewsByWeek.get(w)!;
  };

  let updated = 0;
  for (const p of await getAllPicks()) {
    const ko = kickoff.get(`${p.week}|${p.team}`);
    if (!ko || new Date(ko) <= now) continue; // no game found, bye, or already started
    const prob = teamProb(views(p.week), p.team);
    if (prob === null) continue;
    await setPregameProb(p.entryId, p.week, prob);
    updated++;
  }
  return updated;
}
