import type { TeamStrength, TeamAbbr } from "./types";

/**
 * Ordinal power ranking (#1 = strongest) derived from FPI ratings.
 * Returns a map of team → rank (1-based).
 */
export function computeRanks(strengths: TeamStrength[]): Record<TeamAbbr, number> {
  const sorted = [...strengths].sort((a, b) => b.fpi - a.fpi);
  const ranks: Record<TeamAbbr, number> = {};
  sorted.forEach((s, i) => {
    ranks[s.team] = i + 1;
  });
  return ranks;
}
