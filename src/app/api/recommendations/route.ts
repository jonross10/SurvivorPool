import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { ENTRIES, NAME_TO_ID } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

export async function GET(req: Request) {
  const safetyFloor = Number(new URL(req.url).searchParams.get("safetyFloor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const picksByEntry: Record<string, Set<TeamAbbr>> = {};
  for (const e of ENTRIES) picksByEntry[e.name] = await getUsedTeams(e.id);

  const recs = buildRecommendations(schedule, strengths, odds, picksByEntry, new Date(), safetyFloor);
  const data = recs.map((r) => resource("recommendation", NAME_TO_ID[r.entry] ?? r.entry, r));
  return jsonApi(document(data, { currentWeek: recs[0]?.week ?? null, safetyFloor }));
}
