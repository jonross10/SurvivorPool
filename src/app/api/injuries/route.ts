import { getCache } from "@/lib/db/cache-repo";
import { getInjuriesFresh } from "@/lib/sources/injuries";
import { normalizeTeam } from "@/lib/teams";
import { resource, document, jsonApi, getFilter } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

/**
 * Notable injuries, optionally for one team (`?filter[team]=BAL`). Public, like matchups — injury
 * reports are public info. The map is refreshed on a schedule-aware TTL (short near kickoff), so a
 * game-day read sees fresh inactives.
 */
export async function GET(req: Request) {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const injuries = await getInjuriesFresh(schedule, new Date());

  const teamParam = getFilter(req, "team");
  let team: string | undefined;
  if (teamParam) {
    try { team = normalizeTeam(teamParam); } catch { team = teamParam.toUpperCase(); }
  }
  const byTeam = team ? { [team]: injuries[team] ?? [] } : injuries;

  const data = Object.entries(byTeam).flatMap(([t, list]) =>
    (list ?? []).map((inj, i) => resource("injury", `${t}:${i}`, inj)),
  );
  return jsonApi(document(data, { team: team ?? null, teams: Object.keys(injuries).length }));
}
