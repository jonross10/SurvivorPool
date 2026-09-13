import { getCache } from "@/lib/db/cache-repo";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = schedule.map((g) => resource("game", `${g.week}:${g.away}@${g.home}`, g));
  return jsonApi(document(data, { weeks }));
}
