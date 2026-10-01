import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, errorDocument, jsonApi, getFilter, unauthorized } from "@/lib/jsonapi";
import { resolveActorUserId } from "@/lib/agent-auth";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return unauthorized();
  const entries = await getEntries(userId);
  if (entries.length === 0) return jsonApi(document([], { week: 0, entry: null }));
  const entry = getFilter(req, "entry") ?? entries[0].name;
  const entryId = nameToId(entries)[entry] ?? entries[0].id;
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(entryId);
  // Default to the current week; a ?filter[week]= override lets the agent ask about any week.
  const wkParam = getFilter(req, "week");
  const week = wkParam ? Number(wkParam) : currentWeek(schedule, new Date());
  // buildWinProbs returns the given week plus all later weeks; when the caller asked for a
  // specific week, return just that week (keeps the pick modal and the agent's get_week_options
  // focused instead of shipping the whole remaining season).
  const wps = buildWinProbs(schedule, strengths, odds, week, used)
    .filter((w) => (wkParam ? w.week === week : true));
  const data = wps.map((w) => resource("winprob", `${w.week}:${w.team}`, w));
  return jsonApi(document(data, { week, entry }));
}
