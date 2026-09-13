import { getCache } from "@/lib/db/cache-repo";
import { getPicks } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

export async function GET(req: Request) {
  const safetyFloor = Number(new URL(req.url).searchParams.get("safetyFloor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const entries = await getEntries();
  const idByName = nameToId(entries);

  // Fetch each entry's picks once to derive both the used-team set (excluded from
  // suggestions) and the team already locked in for the current week (if any).
  const usedByEntry: Record<string, Set<TeamAbbr>> = {};
  const picksByWeekByEntry: Record<string, Record<number, string>> = {};
  for (const e of entries) {
    const picks = await getPicks(e.id);
    usedByEntry[e.name] = new Set(picks.map((p) => p.team));
    picksByWeekByEntry[e.name] = Object.fromEntries(picks.map((p) => [p.week, p.team]));
  }

  const recs = buildRecommendations(schedule, strengths, odds, usedByEntry, new Date(), safetyFloor);
  const week = recs[0]?.week ?? null;
  const data = recs.map((r) =>
    resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      // The pick already recorded for the current week, or null if undecided.
      currentPick: week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null,
    }),
  );
  return jsonApi(document(data, { currentWeek: week, safetyFloor }));
}
