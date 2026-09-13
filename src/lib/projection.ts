const HOME_ADV = 2.0;
const SCALE = 7.6;

/** Logistic win-probability projection from FPI ratings. */
export function projectWinProb(
  fpiTeam: number,
  fpiOpp: number,
  teamIsHome: boolean,
): number {
  const edge = fpiTeam - fpiOpp + (teamIsHome ? HOME_ADV : 0);
  return 1 / (1 + Math.exp(-edge / SCALE));
}
