/**
 * A valid American moneyline always has magnitude >= 100 (e.g. -110, +100, +2500).
 * Values like -1, 0, or +50 are impossible and indicate corrupt/mis-parsed data.
 */
export function isValidAmericanOdds(odds: number): boolean {
  return Number.isFinite(odds) && Math.abs(odds) >= 100;
}

/** American odds → raw implied probability (includes the vig). */
export function americanToImplied(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/**
 * Raw implied probability → American odds (favorite negative, underdog positive). Inverse of
 * americanToImplied. Use this to average moneylines across books: average the *probabilities*,
 * then convert back. Averaging American odds numerically is wrong across the ±100 boundary — for
 * a near-pick'em, mixing -110 and +100 lands between -100 and +100, an impossible line.
 */
export function impliedToAmerican(prob: number): number {
  if (prob >= 0.5) return -Math.round((100 * prob) / (1 - prob));
  return Math.round((100 * (1 - prob)) / prob);
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
