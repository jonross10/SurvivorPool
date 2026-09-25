import { getCache } from "@/lib/db/cache-repo";
import { buildGameViews } from "@/lib/game-views";
import { getResultsFresh, resultForGame } from "@/lib/sources/results";
import { currentWeek, weeksOf, resolveSeason } from "@/lib/week";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const cur = currentWeek(schedule, new Date());
  const wkParam = getFilter(req, "week");
  const week = wkParam ? Number(wkParam) : cur;

  const results = await getResultsFresh(cur, resolveSeason());
  const games = buildGameViews(schedule, strengths, odds, week);
  const weeks = weeksOf(schedule);
  const data = games.map((g) =>
    resource("game", `${g.week}:${g.away}@${g.home}`, { ...g, result: resultForGame(results, g.week, g.home, g.away) }),
  );
  return jsonApi(document(data, { currentWeek: cur, week, weeks }));
}
