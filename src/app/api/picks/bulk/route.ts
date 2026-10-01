import { getCache } from "@/lib/db/cache-repo";
import { getEntryStatuses } from "@/lib/entry-status";
import { buildRecommendations } from "@/lib/recommendations";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, resolveSeason } from "@/lib/week";
import { recordPick } from "@/lib/db/picks-repo";
import { resolveActorUserId } from "@/lib/agent-auth";
import { syncOwnerInBackground } from "@/lib/klaviyo-objects";
import { resource, document, errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

/**
 * Lock in an entry's entire remaining projected path in ONE call. Computes the optimized path
 * once (so every week is consistent — no drift from re-planning after each individual pick) and
 * records a pick for each not-yet-locked week. Weeks already picked are left untouched. This is
 * what lets the assistant honor "submit all my future picks from the plan".
 */
export async function POST(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? body ?? {};
  const entryName: unknown = attrs.entry;
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
  if (target.status.eliminated) {
    return jsonApi(errorDocument([{ status: "409", title: "Entry eliminated", detail: `${target.entry.name} is eliminated and can't make picks.` }]), 409);
  }

  const entryContexts = statuses.map((s) => ({
    name: s.entry.name,
    pool: (s.entry.settings.pool as string) ?? "main",
    safetyFloor: s.entry.settings.min_win_chance ?? 0.6,
    picksByWeek: s.picksByWeek,
    eliminated: s.status.eliminated,
  }));
  const rec = buildRecommendations(schedule, strengths, odds, entryContexts, new Date())
    .find((r) => r.entry === target.entry.name);
  const path = rec?.projectedPath ?? [];

  const alreadyPicked = target.picksByWeek as Record<number, string>;
  const submitted: { week: number; team: string; prob: number }[] = [];
  const skipped: { week: number; team: string; reason: string }[] = [];
  for (const p of path) {
    if (alreadyPicked[p.week]) {
      skipped.push({ week: p.week, team: alreadyPicked[p.week], reason: "already locked" });
      continue;
    }
    try {
      await recordPick(target.entry.id, p.week, p.team, p.prob);
      submitted.push({ week: p.week, team: p.team, prob: p.prob });
    } catch (e) {
      skipped.push({ week: p.week, team: p.team, reason: e instanceof Error ? e.message : "conflict" });
    }
  }
  if (submitted.length > 0) syncOwnerInBackground(userId);

  return jsonApi(
    document(
      resource("plan-submit", target.entry.id, { entry: target.entry.name, submitted, skipped }),
      { week, count: submitted.length },
    ),
  );
}
