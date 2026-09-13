import { getCache } from "@/lib/db/cache-repo";
import { getPicks } from "@/lib/db/picks-repo";
import { currentWeek } from "@/lib/week";
import { ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const cur = currentWeek(schedule, new Date());
  const data = [];
  for (const e of ENTRIES) {
    const picks = await getPicks(e.id);
    const usedTeams = picks.map((p) => p.team);
    const picksByWeek: Record<number, string> = {};
    for (const p of picks) picksByWeek[p.week] = p.team;
    data.push(resource("entry", e.id, { name: e.name, usedTeams, picksByWeek }));
  }
  return jsonApi(document(data, { currentWeek: cur }));
}
