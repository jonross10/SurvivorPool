import { getCache, setCache } from "../db/cache-repo";
import { normalizeTeam } from "../teams";
import type { Injury, InjuryMap, Matchup, TeamAbbr } from "../types";

const KEY = "injuries";

// Statuses worth surfacing for survivor. We drop "Active"/"Probable"/null — they're not signal.
const NOTABLE = new Set(["Out", "Doubtful", "Questionable", "IR", "PUP", "Sus"]);
// Severity order for sorting within a team (worst first).
const SEVERITY = ["Out", "IR", "PUP", "Sus", "Doubtful", "Questionable"];

/** The Sleeper `/v1/players/nfl` fields we use. */
interface SleeperPlayer {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string | null;
  injury_status?: string | null;
  injury_body_part?: string | null;
  depth_chart_order?: number | null;
}

/**
 * Keep only injuries that matter for a survivor pick: a notable status on a **starter**
 * (`depth_chart_order` ≤ 2) or on **any QB**. This filters out the long tail of backups and
 * practice-squad noise, so "are the best players available?" has a clean answer. Grouped by team,
 * QB first, then worst status first. Pure and unit-tested.
 */
export function parseInjuries(players: SleeperPlayer[]): InjuryMap {
  const map: InjuryMap = {};
  for (const p of players) {
    if (!p.team || !p.position) continue;
    const status = p.injury_status ?? "";
    if (!NOTABLE.has(status)) continue;
    const isQB = p.position === "QB";
    const starter = p.depth_chart_order != null && p.depth_chart_order <= 2;
    if (!isQB && !starter) continue;
    let team: TeamAbbr;
    try {
      team = normalizeTeam(p.team);
    } catch {
      continue;
    }
    const player = p.full_name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    if (!player) continue;
    (map[team] ??= []).push({ team, player, position: p.position, status, isQB, bodyPart: p.injury_body_part ?? null });
  }
  for (const list of Object.values(map)) {
    list.sort((a, b) => Number(b.isQB) - Number(a.isQB) || SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));
  }
  return map;
}

/** Fetch and parse the current injury map from Sleeper (free, no key). */
export async function fetchInjuries(): Promise<InjuryMap> {
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!res.ok) throw new Error(`Sleeper players ${res.status}`);
  const data = (await res.json()) as Record<string, SleeperPlayer>;
  return parseInjuries(Object.values(data));
}

const SHORT_TTL_MS = 10 * 60 * 1000; // near a kickoff: inactives and game-time decisions land here
const LONG_TTL_MS = 12 * 60 * 60 * 1000; // otherwise: the daily ingest keeps it fresh enough

/**
 * Short cache window when any game kicks off within the next 2 hours or kicked off in the last ~4
 * hours (live); long window the rest of the time. Injury reports barely move midweek but change a
 * lot on game day, so freshness should follow the schedule, not the clock.
 */
export function injuriesTtlMs(schedule: Matchup[], now: Date): number {
  const t = now.getTime();
  const nearKickoff = schedule.some((g) => {
    const k = new Date(g.kickoff).getTime();
    return k - t <= 2 * 3600_000 && t - k <= 4 * 3600_000;
  });
  return nearKickoff ? SHORT_TTL_MS : LONG_TTL_MS;
}

/**
 * The injury map, refetched when the cache is older than the schedule-aware TTL. Read-driven: a
 * request near kickoff refreshes it, so it's fresh exactly when someone's deciding a pick. Falls
 * back to the last-known map if Sleeper is down.
 */
export async function getInjuriesFresh(schedule: Matchup[], now: Date = new Date()): Promise<InjuryMap> {
  const cached = await getCache<InjuryMap>(KEY);
  const ttl = injuriesTtlMs(schedule, now);
  if (cached && now.getTime() - new Date(cached.fetchedAt).getTime() < ttl) return cached.payload;
  try {
    const fresh = await fetchInjuries();
    await setCache(KEY, fresh);
    return fresh;
  } catch {
    return cached?.payload ?? {};
  }
}
