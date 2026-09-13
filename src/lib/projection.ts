const HOME_ADV = 2.0;
const SCALE = 7.6;

/**
 * Logistic win-probability projection from FPI ratings.
 *
 * Home field is applied as a symmetric swing (+HOME_ADV to the home team,
 * −HOME_ADV to the away team) so that the two sides of a single matchup are
 * complementary: projectWinProb(A, B, true) + projectWinProb(B, A, false) === 1.
 * This keeps projected probabilities calibrated and avoids biasing the pick
 * engine toward home teams in FPI-projected future weeks.
 */
export function projectWinProb(
  fpiTeam: number,
  fpiOpp: number,
  teamIsHome: boolean,
): number {
  const edge = fpiTeam - fpiOpp + (teamIsHome ? HOME_ADV : -HOME_ADV);
  return 1 / (1 + Math.exp(-edge / SCALE));
}
