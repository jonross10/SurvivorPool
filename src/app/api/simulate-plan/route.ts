import { getCache } from "@/lib/db/cache-repo";
import { getEntryStatuses } from "@/lib/entry-status";
import { buildRecommendations } from "@/lib/recommendations";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, resolveSeason } from "@/lib/week";
import { resolveActorUserId } from "@/lib/agent-auth";
import { resource, document, errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

/**
 * What-if planner: given an entry and hypothetical picks ({ "<week>": "<team>" }), return
 * the optimized projected path as if those picks were made — without actually locking them.
 * Lets the agent answer "if I use DAL in Week 5, what does the rest of the season look like?".
 */
export async function POST(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? body ?? {};
  const entryName: unknown = attrs.entry;
  // Accept hypothetical picks as a { "<week>": "<team>" } map (object or JSON string), and/or
  // a single week+team pair (easiest for the agent to pass as scalar tool variables).
  const hypoPicks: Record<string, string> = {};
  let picksInput = attrs.picks;
  if (typeof picksInput === "string") { try { picksInput = JSON.parse(picksInput); } catch { picksInput = null; } }
  if (picksInput && typeof picksInput === "object" && !Array.isArray(picksInput)) {
    for (const [w, t] of Object.entries(picksInput)) if (typeof t === "string") hypoPicks[String(w)] = t;
  }
  if (attrs.week != null && typeof attrs.team === "string" && attrs.team.trim()) {
    hypoPicks[String(attrs.week)] = attrs.team.trim();
  }
  // Optional "replan from week N": drop the entry's locked picks for weeks >= N so the optimizer
  // re-plans that segment fresh (the teams used there become available again), instead of treating
  // every recorded pick as fixed. Weeks before N stay put.
  const fromRaw = attrs.fromWeek ?? attrs.from_week;
  if (typeof entryName !== "string" || !entryName.trim()) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "entry is required" }]), 400);
  }

  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const week = currentWeek(schedule, new Date());
  const results = await getResultsFresh(week, resolveSeason());
  const statuses = await getEntryStatuses(results, userId);

  const target = statuses.find((s) => s.entry.name.toLowerCase() === entryName.toLowerCase());
  if (!target) {
    return jsonApi(errorDocument([{ status: "404", title: "Unknown entry", detail: `No entry named "${entryName}"` }]), 404);
  }

  // Can't replan the past, so clamp the replan week to the current week.
  const fromWeek = fromRaw != null && Number.isFinite(Number(fromRaw)) ? Math.max(Number(fromRaw), week) : null;
  const full = target.picksByWeek as Record<number, string>;
  const kept = fromWeek != null
    ? Object.fromEntries(Object.entries(full).filter(([w]) => Number(w) < fromWeek))
    : full;
  const targetPicks = { ...kept, ...hypoPicks };

  // Plan the whole pool (for diversification), but replace the target entry's picks with the
  // kept + hypothetical set so its projected path reflects the replan.
  const entryContexts = statuses.map((s) => ({
    name: s.entry.name,
    pool: (s.entry.settings.pool as string) ?? "main",
    safetyFloor: s.entry.settings.min_win_chance ?? 0.6,
    picksByWeek: s.entry.name === target.entry.name ? targetPicks : (s.picksByWeek as Record<number, string>),
    eliminated: s.status.eliminated,
  }));

  const rec = buildRecommendations(schedule, strengths, odds, entryContexts, new Date())
    .find((r) => r.entry === target.entry.name);

  return jsonApi(
    document(
      resource("plan", target.entry.id, {
        entry: target.entry.name,
        fromWeek,
        hypotheticalPicks: hypoPicks,
        usedTeams: Object.values(targetPicks),
        projectedPath: rec?.projectedPath ?? [],
        currentSuggestion: rec?.pick ?? null,
      }),
      { week },
    ),
  );
}
