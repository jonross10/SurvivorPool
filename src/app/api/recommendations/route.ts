import { getCache } from "@/lib/db/cache-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { nameToId } from "@/lib/entries-util";
import { getResultsFresh } from "@/lib/sources/results";
import { getEntryStatuses } from "@/lib/entry-status";
import { pickResultViews } from "@/lib/elimination";
import { currentWeek } from "@/lib/week";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

export async function GET(req: Request) {
  const safetyFloor = Number(new URL(req.url).searchParams.get("safetyFloor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const cur = currentWeek(schedule, new Date());
  const results = await getResultsFresh(cur, Number(process.env.NFL_SEASON ?? "2026"));
  // getEntryStatuses already loaded each entry with its picks; reuse that to
  // derive the used-team set and per-week pick map without re-querying.
  const statuses = await getEntryStatuses(results);
  const statusByName = Object.fromEntries(statuses.map((s) => [s.entry.name, s.status]));
  const idByName = nameToId(statuses.map((s) => s.entry));

  const usedByEntry: Record<string, Set<TeamAbbr>> = {};
  const picksByWeekByEntry: Record<string, Record<number, string>> = {};
  for (const s of statuses) {
    usedByEntry[s.entry.name] = new Set(Object.values(s.picksByWeek));
    picksByWeekByEntry[s.entry.name] = s.picksByWeek;
  }

  const recs = buildRecommendations(schedule, strengths, odds, usedByEntry, new Date(), safetyFloor);
  const week = recs[0]?.week ?? null;
  const weeks = [...new Set(schedule.map((m) => m.week))].sort((a, b) => a - b);
  const data = recs.map((r) => {
    const status = statusByName[r.entry];
    const eliminated = status?.eliminated ?? false;
    const picksByWeek = Object.fromEntries(
      Object.entries(picksByWeekByEntry[r.entry] ?? {}).map(([w, t]) => [Number(w), t]),
    );
    return resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      // Eliminated entries get no suggested pick.
      pick: eliminated ? null : r.pick,
      eliminated,
      eliminatedWeek: status?.eliminatedWeek ?? null,
      // The pick already recorded for the current week, or null if undecided.
      currentPick: week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null,
      // The entry's full pick history (week → team), for the season timeline.
      picksByWeek: picksByWeekByEntry[r.entry] ?? {},
      // Per-week score/status for every pick this entry has made.
      resultsByWeek: pickResultViews(picksByWeek, results, status?.byWeek ?? {}),
    });
  });
  // Alive entries first, then eliminated, each group keeping the name order.
  data.sort((a, b) => Number(a.attributes.eliminated) - Number(b.attributes.eliminated));
  return jsonApi(document(data, { currentWeek: week, safetyFloor, weeks }));
}
