/** American odds → raw implied probability (includes the vig). */
export function americanToImplied(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/**
 * Remove the bookmaker overround from a two-way market by normalizing the two
 * raw implied probabilities so they sum to 1.
 */
export function devigTwoWay(
  favOdds: number,
  dogOdds: number,
): { favProb: number; dogProb: number } {
  const a = americanToImplied(favOdds);
  const b = americanToImplied(dogOdds);
  const total = a + b;
  return { favProb: a / total, dogProb: b / total };
}
