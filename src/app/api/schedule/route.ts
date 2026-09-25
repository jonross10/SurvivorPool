import { getCache } from "@/lib/db/cache-repo";
import { getResultsFresh, resultForGame } from "@/lib/sources/results";
import { currentWeek, weeksOf, resolveSeason } from "@/lib/week";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const cur = currentWeek(schedule, new Date());
  const results = await getResultsFresh(cur, resolveSeason());
  const weeks = weeksOf(schedule);
  const data = schedule.map((g) =>
    resource("game", `${g.week}:${g.away}@${g.home}`, { ...g, result: resultForGame(results, g.week, g.home, g.away) }),
  );
  return jsonApi(document(data, { weeks }));
}
