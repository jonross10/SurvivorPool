import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const entries = await getEntries();
  if (entries.length === 0) return jsonApi(document([], { week: 0, entry: null }));
  const entry = getFilter(req, "entry") ?? entries[0].name;
  const entryId = nameToId(entries)[entry] ?? entries[0].id;
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(entryId);
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  const data = wps.map((w) => resource("winprob", `${w.week}:${w.team}`, w));
  return jsonApi(document(data, { week, entry }));
}
