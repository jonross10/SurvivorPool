import type { TeamAbbr } from "./types";

export const TEAMS: TeamAbbr[] = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

const VALID = new Set(TEAMS);

// Any non-canonical form → canonical abbreviation, keyed by lowercased text.
// Covers: city-only names, "City Mascot" full names (The Odds API), ESPN's
// abbreviation variants (JAX, WSH), and legacy relocations (OAK, SD, STL).
const ALIASES: Record<string, TeamAbbr> = {
  // ESPN / legacy abbreviation variants
  "jax": "JAC", "wsh": "WAS", "oak": "LV", "sd": "LAC", "sdg": "LAC", "stl": "LAR",
  // city-only
  "arizona": "ARI", "atlanta": "ATL", "baltimore": "BAL", "buffalo": "BUF",
  "carolina": "CAR", "chicago": "CHI", "cincinnati": "CIN", "cleveland": "CLE",
  "dallas": "DAL", "denver": "DEN", "detroit": "DET", "green bay": "GB",
  "houston": "HOU", "indianapolis": "IND", "jacksonville": "JAC", "kansas city": "KC",
  "las vegas": "LV", "oakland": "LV", "miami": "MIA", "minnesota": "MIN",
  "new england": "NE", "new orleans": "NO", "philadelphia": "PHI", "pittsburgh": "PIT",
  "san francisco": "SF", "seattle": "SEA", "tampa bay": "TB", "tennessee": "TEN",
  "washington": "WAS",
  "l.a. chargers": "LAC", "la chargers": "LAC", "los angeles chargers": "LAC",
  "l.a. rams": "LAR", "la rams": "LAR", "los angeles rams": "LAR",
  "n.y. giants": "NYG", "ny giants": "NYG", "new york giants": "NYG",
  "n.y. jets": "NYJ", "ny jets": "NYJ", "new york jets": "NYJ",
  // "City Mascot" full names (The Odds API `home_team`/`away_team`)
  "arizona cardinals": "ARI", "atlanta falcons": "ATL", "baltimore ravens": "BAL",
  "buffalo bills": "BUF", "carolina panthers": "CAR", "chicago bears": "CHI",
  "cincinnati bengals": "CIN", "cleveland browns": "CLE", "dallas cowboys": "DAL",
  "denver broncos": "DEN", "detroit lions": "DET", "green bay packers": "GB",
  "houston texans": "HOU", "indianapolis colts": "IND", "jacksonville jaguars": "JAC",
  "kansas city chiefs": "KC", "las vegas raiders": "LV", "miami dolphins": "MIA",
  "minnesota vikings": "MIN", "new england patriots": "NE", "new orleans saints": "NO",
  "philadelphia eagles": "PHI", "pittsburgh steelers": "PIT", "san francisco 49ers": "SF",
  "seattle seahawks": "SEA", "tampa bay buccaneers": "TB", "tennessee titans": "TEN",
  "washington commanders": "WAS", "washington football team": "WAS",
  "washington redskins": "WAS", "oakland raiders": "LV", "san diego chargers": "LAC",
  "st. louis rams": "LAR",
};

/**
 * Normalize any team identifier — canonical abbreviation, alternate abbreviation
 * (ESPN's JAX/WSH), city name, or full "City Mascot" name — to our canonical
 * abbreviation. Throws on anything unrecognized so bad data surfaces loudly
 * rather than silently dropping a team.
 */
export function normalizeTeam(input: string): TeamAbbr {
  const raw = input.trim();
  if (VALID.has(raw)) return raw;
  const upper = raw.toUpperCase();
  if (VALID.has(upper)) return upper;
  const alias = ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  throw new Error(`Unknown team: "${input}"`);
}
