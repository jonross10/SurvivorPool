import { getCache } from "@/lib/db/cache-repo";
import { buildRecommendations } from "@/lib/recommendations";
import { buildGameViews } from "@/lib/game-views";
import { nameToId } from "@/lib/entries-util";
import { getResultsFresh } from "@/lib/sources/results";
import { getEntryStatuses } from "@/lib/entry-status";
import { pickResultViews } from "@/lib/elimination";
import { currentWeek, weeksOf, resolveSeason } from "@/lib/week";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const safetyFloor = Number(new URL(req.url).searchParams.get("safetyFloor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const cur = currentWeek(schedule, new Date());
  const results = await getResultsFresh(cur, resolveSeason());
  // getEntryStatuses already loaded each entry with its picks; reuse that to
  // derive the used-team set and per-week pick map without re-querying.
  const statuses = await getEntryStatuses(results);
  const statusByName = Object.fromEntries(statuses.map((s) => [s.entry.name, s.status]));
  const idByName = nameToId(statuses.map((s) => s.entry));

  const entryContexts = statuses.map((s) => ({
    name: s.entry.name,
    pool: (s.entry.settings as { pool?: string }).pool ?? "main",
    picksByWeek: s.picksByWeek,
    eliminated: s.status.eliminated,
  }));
  const picksByWeekByEntry: Record<string, Record<number, string>> = Object.fromEntries(
    statuses.map((s) => [s.entry.name, s.picksByWeek]),
  );

  const recs = buildRecommendations(schedule, strengths, odds, entryContexts, new Date(), safetyFloor);
  const week = recs[0]?.week ?? null;
  const weeks = weeksOf(schedule);
  // Win prob for a team in the current week (used to show the locked pick's odds).
  const curViews = week !== null ? buildGameViews(schedule, strengths, odds, week) : [];
  const curProb = (team: string): number | null => {
    const g = curViews.find((x) => x.home === team || x.away === team);
    return g ? (g.home === team ? g.homeProb : g.awayProb) : null;
  };
  const data = recs.map((r) => {
    const status = statusByName[r.entry];
    const eliminated = status?.eliminated ?? false;
    const picksByWeek = Object.fromEntries(
      Object.entries(picksByWeekByEntry[r.entry] ?? {}).map(([w, t]) => [Number(w), t]),
    );
    const currentPick = week !== null ? (picksByWeekByEntry[r.entry]?.[week] ?? null) : null;
    return resource("recommendation", idByName[r.entry] ?? r.entry, {
      ...r,
      // Eliminated entries get no suggested pick.
      pick: eliminated ? null : r.pick,
      eliminated,
      eliminatedWeek: status?.eliminatedWeek ?? null,
      // The pick already recorded for the current week, or null if undecided.
      currentPick,
      // Win prob of the current-week locked pick (for display when no score yet).
      currentPickProb: currentPick ? curProb(currentPick) : null,
      // The entry's full pick history (week → team), for the season timeline.
      picksByWeek: picksByWeekByEntry[r.entry] ?? {},
      // Per-week score/status for every pick this entry has made.
      resultsByWeek: pickResultViews(picksByWeek, results, status?.byWeek ?? {}),
    });
  });
  // Alive entries first (name order), then eliminated ordered by how long they
  // lasted — most-recently-out higher, earliest-out at the bottom.
  data.sort((a, b) => {
    const ae = a.attributes.eliminated ? 1 : 0;
    const be = b.attributes.eliminated ? 1 : 0;
    if (ae !== be) return ae - be;
    if (ae === 1) return (Number(b.attributes.eliminatedWeek) || 0) - (Number(a.attributes.eliminatedWeek) || 0);
    return 0;
  });
  return jsonApi(document(data, { currentWeek: week, safetyFloor, weeks }));
}
