import type { TeamStrength } from "../types";
import { normalizeTeam } from "../teams";

export interface StrengthProvider {
  fetchStrengths(season: number): Promise<TeamStrength[]>;
}

interface FpiCategory { name: string; names?: string[]; values?: number[] }
interface FpiTeam { team?: { abbreviation?: string }; categories?: FpiCategory[] }
interface FpiResponse { teams?: FpiTeam[] }

export function parseFpi(data: FpiResponse): TeamStrength[] {
  const out: TeamStrength[] = [];
  for (const t of data.teams ?? []) {
    const abbr = t.team?.abbreviation;
    if (!abbr) continue;
    const cat = (t.categories ?? []).find((c) => c.name === "fpi");
    if (!cat) continue;
    const names = cat.names ?? [];
    const values = cat.values ?? [];
    const idx = names.indexOf("fpi");
    const fpi = Number(values[idx >= 0 ? idx : 0]);
    if (!Number.isFinite(fpi)) continue;
    try {
      out.push({ team: normalizeTeam(abbr), fpi });
    } catch {
      // skip anything that isn't one of our 32 teams
    }
  }
  return out;
}

export const espnFpiProvider: StrengthProvider = {
  async fetchStrengths(season: number): Promise<TeamStrength[]> {
    const url = `https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?season=${season}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN FPI failed: ${res.status}`);
    return parseFpi(await res.json());
  },
};
