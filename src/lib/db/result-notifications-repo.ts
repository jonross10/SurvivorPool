import { sql } from "./client";

/** Set of "<entryId>:<week>" keys we've already sent a result notification for. */
export async function getNotifiedResultKeys(): Promise<Set<string>> {
  const rows = (await sql`SELECT entry_id AS "entryId", week FROM pick_result_notifications`) as
    { entryId: string; week: number }[];
  return new Set(rows.map((r) => `${r.entryId}:${r.week}`));
}

/** Record that an entry-week's result notification has been sent (idempotent). */
export async function markResultNotified(entryId: string, week: number, result: string): Promise<void> {
  await sql`
    INSERT INTO pick_result_notifications (entry_id, week, result)
    VALUES (${entryId}, ${week}, ${result})
    ON CONFLICT (entry_id, week) DO NOTHING
  `;
}
