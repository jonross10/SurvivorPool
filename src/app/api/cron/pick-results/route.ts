import { getCache } from "@/lib/db/cache-repo";
import { getAllOwnerIds } from "@/lib/db/entries-repo";
import { getEntryStatuses } from "@/lib/entry-status";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, resolveSeason } from "@/lib/week";
import { getNotifiedResultKeys, markResultNotified } from "@/lib/db/result-notifications-repo";
import { trackEventByExternalId, PICK_RESULT_METRIC } from "@/lib/klaviyo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { requireCron } from "@/lib/cron-auth";
import type { Matchup, GameResult, TeamAbbr } from "@/lib/types";

/** Find the completed game for a team in a given week, or null if not final. */
function finalGame(results: GameResult[], week: number, team: TeamAbbr): GameResult | null {
  const g = results.find((r) => r.week === week && (r.home === team || r.away === team));
  return g && g.completed ? g : null;
}

/**
 * Detect newly-decided picks and fire a "Pick Result" Klaviyo event per entry-week (a flow
 * turns it into a push). Deduped via pick_result_notifications. `?seed=1` marks all current
 * results as notified WITHOUT sending — run once on setup to avoid a backlog blast.
 */
export async function GET(req: Request) {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  const seed = new URL(req.url).searchParams.get("seed") === "1";
  try {
    const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
    const week = currentWeek(schedule, new Date());
    const results = await getResultsFresh(week, resolveSeason());
    const notified = await getNotifiedResultKeys();

    let sent = 0;
    let seeded = 0;
    const failedOwners: string[] = [];
    for (const ownerId of await getAllOwnerIds()) {
      // Isolate each owner: one owner's failure must not block notifications for the rest.
      try {
        const statuses = await getEntryStatuses(results, ownerId);
        for (const s of statuses) {
          const tiesSurvive = s.entry.settings.ties_survive ?? true;
          for (const [wStr, team] of Object.entries(s.picksByWeek)) {
            const w = Number(wStr);
            const key = `${s.entry.id}:${w}`;
            if (notified.has(key)) continue;
            const game = finalGame(results, w, team as TeamAbbr);
            if (!game) continue; // not decided yet

            const outcome = game.winner === team ? "won" : game.winner === null ? "tie" : "lost";
            const isHome = game.home === team;
            const opp = isHome ? game.away : game.home;
            const teamScore = isHome ? game.homeScore : game.awayScore;
            const oppScore = isHome ? game.awayScore : game.homeScore;

            if (!seed) {
              const survived = outcome === "won" || (outcome === "tie" && tiesSurvive);
              const title = survived ? `${s.entry.name} survived Week ${w}! 🎉` : `${s.entry.name} is out 😞`;
              const verb = outcome === "won" ? "beat" : outcome === "tie" ? "tied" : "lost to";
              const score = teamScore != null && oppScore != null ? ` ${teamScore}-${oppScore}` : "";
              await trackEventByExternalId(ownerId, PICK_RESULT_METRIC, {
                user_id: ownerId,
                entry_name: s.entry.name,
                week: w,
                team,
                opponent: opp,
                outcome,
                survived,
                push_title: title,
                push_body: `${team} ${verb} ${opp}${score} in Week ${w}.`,
                push_url: "/",
              });
              sent++;
            } else {
              seeded++;
            }
            await markResultNotified(s.entry.id, w, outcome);
          }
        }
      } catch (e) {
        failedOwners.push(ownerId);
        console.error(`[cron] pick-results owner ${ownerId} failed:`, e instanceof Error ? e.message : e);
      }
    }
    return jsonApi(metaDocument({ ok: true, seed, sent, seeded, failed: failedOwners.length, at: new Date().toISOString() }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[cron] pick-results failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Cron pick-results failed", detail }]), 500);
  }
}
