import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import { NAME_TO_ID, ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const entry = getFilter(req, "entry") ?? ENTRIES[0].name;
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(NAME_TO_ID[entry] ?? ENTRIES[0].id);
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  const data = wps.map((w) => resource("winprob", `${w.week}:${w.team}`, w));
  return jsonApi(document(data, { week, entry }));
}
