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

  // Plan the whole pool (for diversification), but augment the target entry with the
  // hypothetical picks so its projected path reflects them.
  const entryContexts = statuses.map((s) => {
    const base = s.picksByWeek as Record<number, string>;
    const picksByWeek = s.entry.name === target.entry.name ? { ...base, ...hypoPicks } : base;
    return {
      name: s.entry.name,
      pool: (s.entry.settings.pool as string) ?? "main",
      safetyFloor: s.entry.settings.min_win_chance ?? 0.6,
      picksByWeek,
      eliminated: s.status.eliminated,
    };
  });

  const rec = buildRecommendations(schedule, strengths, odds, entryContexts, new Date())
    .find((r) => r.entry === target.entry.name);
  const mergedUsed = Object.values({ ...target.picksByWeek, ...hypoPicks });

  return jsonApi(
    document(
      resource("plan", target.entry.id, {
        entry: target.entry.name,
        hypotheticalPicks: hypoPicks,
        usedTeams: mergedUsed,
        projectedPath: rec?.projectedPath ?? [],
        currentSuggestion: rec?.pick ?? null,
      }),
      { week },
    ),
  );
}
