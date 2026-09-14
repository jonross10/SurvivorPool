import { getCache } from "@/lib/db/cache-repo";
import { getPicks } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { getEntries } from "@/lib/db/entries-repo";
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
  const statuses = await getEntryStatuses(results);
  const statusByName = Object.fromEntries(statuses.map((s) => [s.entry.name, s.status]));

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
