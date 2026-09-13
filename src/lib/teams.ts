import type { TeamAbbr } from "./types";

export const TEAMS: TeamAbbr[] = [
  "ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
  "HOU","IND","JAC","KC","LV","LAC","LAR","MIA","MIN","NE","NO","NYG",
  "NYJ","PHI","PIT","SF","SEA","TB","TEN","WAS",
];

const NAME_TO_ABBR: Record<string, TeamAbbr> = {
  "Arizona":"ARI","Atlanta":"ATL","Baltimore":"BAL","Buffalo":"BUF",
  "Carolina":"CAR","Chicago":"CHI","Cincinnati":"CIN","Cleveland":"CLE",
  "Dallas":"DAL","Denver":"DEN","Detroit":"DET","Green Bay":"GB",
  "Houston":"HOU","Indianapolis":"IND","Jacksonville":"JAC","Kansas City":"KC",
  "Las Vegas":"LV","Oakland":"LV","L.A. Chargers":"LAC","LA Chargers":"LAC",
  "Los Angeles Chargers":"LAC","L.A. Rams":"LAR","LA Rams":"LAR",
  "Los Angeles Rams":"LAR","Miami":"MIA","Minnesota":"MIN","New England":"NE",
  "New Orleans":"NO","N.Y. Giants":"NYG","NY Giants":"NYG","New York Giants":"NYG",
  "N.Y. Jets":"NYJ","NY Jets":"NYJ","New York Jets":"NYJ","Philadelphia":"PHI",
  "Pittsburgh":"PIT","San Francisco":"SF","Seattle":"SEA","Tampa Bay":"TB",
  "Tennessee":"TEN","Washington":"WAS",
};

const VALID = new Set(TEAMS);

export function normalizeTeam(input: string): TeamAbbr {
  const trimmed = input.trim();
  if (VALID.has(trimmed)) return trimmed;
  const mapped = NAME_TO_ABBR[trimmed];
  if (mapped) return mapped;
  throw new Error(`Unknown team: "${input}"`);
}
