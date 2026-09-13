import type { Matchup } from "../types";
import { normalizeTeam } from "../teams";

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { displayName: string; abbreviation: string };
}
interface EspnEvent {
  date: string;
  competitions: { competitors: EspnCompetitor[] }[];
}
interface EspnScoreboard { events: EspnEvent[] }

function toAbbr(c: EspnCompetitor): string {
  try {
    return normalizeTeam(c.team.abbreviation);
  } catch {
    return normalizeTeam(c.team.displayName);
  }
}

export function parseScoreboard(data: EspnScoreboard, week: number): Matchup[] {
  const out: Matchup[] = [];
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    out.push({ week, home: toAbbr(home), away: toAbbr(away), kickoff: ev.date });
  }
  return out;
}

export async function fetchWeek(week: number, season: number): Promise<Matchup[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard ${week} failed: ${res.status}`);
  return parseScoreboard(await res.json(), week);
}

export async function fetchSeasonSchedule(season: number, weeks = 18): Promise<Matchup[]> {
  const all: Matchup[] = [];
  for (let w = 1; w <= weeks; w++) all.push(...(await fetchWeek(w, season)));
  return all;
}
