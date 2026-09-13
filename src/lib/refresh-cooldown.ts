/** Manual data refresh is limited to once per hour (server-enforced). */
export const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Milliseconds remaining before a manual refresh is allowed again, based on when
 * the data was last fetched. Returns 0 when a refresh is permitted (no prior
 * fetch, or the cooldown has elapsed).
 */
export function cooldownRemainingMs(fetchedAtIso: string | null, now: Date): number {
  if (!fetchedAtIso) return 0;
  const elapsed = now.getTime() - new Date(fetchedAtIso).getTime();
  return Math.max(0, REFRESH_COOLDOWN_MS - elapsed);
}
