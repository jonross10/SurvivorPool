import { sql } from "./client";

export type OverrideOutcome = "survived" | "out";
export type Overrides = Record<number, OverrideOutcome>;

export async function getOverrides(entryId: string): Promise<Overrides> {
  const rows = (await sql`
    SELECT week, outcome FROM pick_overrides WHERE entry_id = ${entryId}
  `) as unknown as { week: number; outcome: OverrideOutcome }[];
  return Object.fromEntries(rows.map((r) => [r.week, r.outcome]));
}

export async function setOverride(
  entryId: string,
  week: number,
  outcome: OverrideOutcome,
): Promise<void> {
  await sql`
    INSERT INTO pick_overrides (entry_id, week, outcome)
    VALUES (${entryId}, ${week}, ${outcome})
    ON CONFLICT (entry_id, week) DO UPDATE SET outcome = EXCLUDED.outcome
  `;
}

export async function clearOverride(entryId: string, week: number): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM pick_overrides WHERE entry_id = ${entryId} AND week = ${week} RETURNING week
  `) as unknown[];
  return rows.length > 0;
}
