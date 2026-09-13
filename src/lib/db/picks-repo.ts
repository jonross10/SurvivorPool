import { sql } from "./client";
import type { TeamAbbr } from "../types";

export interface PickRow {
  week: number;
  team: TeamAbbr;
}

export function deriveUsedTeams(rows: PickRow[]): Set<TeamAbbr> {
  return new Set(rows.map((r) => r.team));
}

export async function getPicks(entryId: string): Promise<PickRow[]> {
  return (await sql`
    SELECT week, team FROM picks WHERE entry_id = ${entryId} ORDER BY week
  `) as unknown as PickRow[];
}

export async function recordPick(
  entryId: string,
  week: number,
  team: TeamAbbr,
  winProb: number,
): Promise<void> {
  // Throws on UNIQUE violation (team reused, or week already picked).
  await sql`
    INSERT INTO picks (entry_id, week, team, win_prob_at_pick)
    VALUES (${entryId}, ${week}, ${team}, ${winProb})
  `;
}

export async function getUsedTeams(entryId: string): Promise<Set<TeamAbbr>> {
  return deriveUsedTeams(await getPicks(entryId));
}

export async function removePick(entryId: string, week: number): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM picks WHERE entry_id = ${entryId} AND week = ${week} RETURNING id
  `) as unknown[];
  return rows.length > 0;
}
