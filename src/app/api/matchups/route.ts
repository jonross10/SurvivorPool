import { getCache } from "@/lib/db/cache-repo";
import { buildGameViews } from "@/lib/game-views";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, currentSeason } from "@/lib/week";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const cur = currentWeek(schedule, new Date());
  const wkParam = getFilter(req, "week");
  const week = wkParam ? Number(wkParam) : cur;

  const results = await getResultsFresh(cur, Number(process.env.NFL_SEASON) || currentSeason(new Date()));
  const games = buildGameViews(schedule, strengths, odds, week);
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = games.map((g) => {
    const result = results.find((r) => r.week === g.week && r.home === g.home && r.away === g.away) ?? null;
    return resource("game", `${g.week}:${g.away}@${g.home}`, { ...g, result });
  });
  return jsonApi(document(data, { currentWeek: cur, week, weeks }));
}
