import type { MoneylineGame } from "../types";
import { normalizeTeam } from "../teams";

interface OddsOutcome { name: string; price: number }
interface OddsMarket { key: string; outcomes: OddsOutcome[] }
interface OddsBook { markets: OddsMarket[] }
interface OddsGame {
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: OddsBook[];
}

function avgPrice(game: OddsGame, teamName: string): number | null {
  const prices: number[] = [];
  for (const book of game.bookmakers ?? []) {
    const h2h = book.markets.find((m) => m.key === "h2h");
    const outcome = h2h?.outcomes.find((o) => o.name === teamName);
    if (outcome) prices.push(outcome.price);
  }
  if (prices.length === 0) return null;
  return prices.reduce((a, b) => a + b, 0) / prices.length;
}

/** `weekLookup` maps `${homeAbbr}|${awayAbbr}` → week (from the schedule). */
export function parseOdds(
  data: OddsGame[],
  weekLookup: Map<string, number>,
): MoneylineGame[] {
  const out: MoneylineGame[] = [];
  for (const g of data) {
    let home: string, away: string;
    try {
      home = normalizeTeam(g.home_team);
      away = normalizeTeam(g.away_team);
    } catch {
      continue;
    }
    const homeOdds = avgPrice(g, g.home_team);
    const awayOdds = avgPrice(g, g.away_team);
    if (homeOdds === null || awayOdds === null) continue;
    const week = weekLookup.get(`${home}|${away}`);
    if (week === undefined) continue;
    out.push({ week, home, away, homeOdds: Math.round(homeOdds), awayOdds: Math.round(awayOdds) });
  }
  return out;
}

export async function fetchOdds(apiKey: string): Promise<OddsGame[]> {
  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API failed: ${res.status}`);
  return res.json();
}
