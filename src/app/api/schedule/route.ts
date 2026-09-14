import { getCache } from "@/lib/db/cache-repo";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, currentSeason } from "@/lib/week";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const cur = currentWeek(schedule, new Date());
  const results = await getResultsFresh(cur, Number(process.env.NFL_SEASON) || currentSeason(new Date()));
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = schedule.map((g) => {
    const result = results.find((r) => r.week === g.week && r.home === g.home && r.away === g.away) ?? null;
    return resource("game", `${g.week}:${g.away}@${g.home}`, { ...g, result });
  });
  return jsonApi(document(data, { weeks }));
}
