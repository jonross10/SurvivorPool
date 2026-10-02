import { getCache } from "@/lib/db/cache-repo";
import { getAllOwnerIds } from "@/lib/db/entries-repo";
import { getEntryStatuses } from "@/lib/entry-status";
import { getResultsFresh } from "@/lib/sources/results";
import { currentWeek, resolveSeason } from "@/lib/week";
import { getNotifiedKeys, markNotified } from "@/lib/db/result-notifications-repo";
import { getAllPrefs, DEFAULT_PREFS } from "@/lib/db/notification-prefs-repo";
import { detectEvents, eventMessage, isLiveEvent } from "@/lib/game-events";
import { trackEventByExternalId, PICK_RESULT_METRIC } from "@/lib/klaviyo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { requireCron } from "@/lib/cron-auth";
import type { Matchup, GameResult, TeamAbbr } from "@/lib/types";

/** The game a team is playing in a given week, or null. */
function gameFor(results: GameResult[], week: number, team: TeamAbbr): GameResult | null {
  return results.find((r) => r.week === week && (r.home === team || r.away === team)) ?? null;
}

/**
 * Fire pick notifications for the current week's picked games. Three event types per pick, each
 * deduped via pick_result_notifications(entry, week, event_type) so it sends at most once:
 *   - final    (win/loss)      — gated by the owner's notify_final preference
 *   - halftime / close (live)  — gated by notify_live
 * Each fires a "Pick Result" Klaviyo event carrying push_title/push_body, which a flow turns into
 * a push. Designed to be polled frequently (e.g. every ~3 min by an external scheduler): it
 * early-exits when nothing has kicked off, and dedup makes repeated runs safe.
 * `?seed=1` marks all currently-true events as notified WITHOUT sending (run once on setup).
 */
export async function GET(req: Request) {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  const seed = new URL(req.url).searchParams.get("seed") === "1";
  try {
    const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
    const week = currentWeek(schedule, new Date());
    const results = await getResultsFresh(week, resolveSeason());

    // Early exit: if no game this week has kicked off, there's nothing to notify about.
    const anyActive = results.some((r) => r.week === week && (r.inProgress || r.completed));
    if (!anyActive) {
      return jsonApi(metaDocument({ ok: true, idle: true, week, at: new Date().toISOString() }));
    }

    const notified = await getNotifiedKeys();
    const prefs = await getAllPrefs();

    let sent = 0;
    let seeded = 0;
    const failedOwners: string[] = [];
    for (const ownerId of await getAllOwnerIds()) {
      try {
        const ownerPrefs = prefs.get(ownerId) ?? DEFAULT_PREFS;
        const statuses = await getEntryStatuses(results, ownerId);
        for (const s of statuses) {
          for (const [wStr, team] of Object.entries(s.picksByWeek)) {
            const w = Number(wStr);
            if (w !== week) continue; // only the live week produces notifications
            const game = gameFor(results, w, team as TeamAbbr);
            if (!game) continue;

            for (const ev of detectEvents(game, team as TeamAbbr)) {
              if (ev.type === "final" ? !ownerPrefs.notifyFinal : !ownerPrefs.notifyLive) continue;
              const key = `${s.entry.id}:${w}:${ev.type}`;
              if (notified.has(key)) continue;

              const detail = ev.outcome ?? ev.type;
              if (!seed) {
                const { title, body } = eventMessage(s.entry.name, game, team as TeamAbbr, ev);
                await trackEventByExternalId(ownerId, PICK_RESULT_METRIC, {
                  user_id: ownerId,
                  entry_name: s.entry.name,
                  week: w,
                  team,
                  event_type: ev.type,
                  outcome: ev.outcome ?? null,
                  survived: ev.type === "final" ? ev.outcome === "won" || (ev.outcome === "tie" && (s.entry.settings.ties_survive ?? true)) : null,
                  push_title: title,
                  push_body: body,
                  push_url: isLiveEvent(ev.type) ? "/matchups" : "/",
                });
                sent++;
              } else {
                seeded++;
              }
              await markNotified(s.entry.id, w, ev.type, detail);
            }
          }
        }
      } catch (e) {
        failedOwners.push(ownerId);
        console.error(`[cron] pick-results owner ${ownerId} failed:`, e instanceof Error ? e.message : e);
      }
    }
    return jsonApi(metaDocument({ ok: true, seed, sent, seeded, failed: failedOwners.length, week, at: new Date().toISOString() }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[cron] pick-results failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Cron pick-results failed", detail }]), 500);
  }
}
