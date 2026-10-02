import { sql } from "./client";

/** Set of "<entryId>:<week>:<eventType>" keys already notified (final / halftime / close). */
export async function getNotifiedKeys(): Promise<Set<string>> {
  const rows = (await sql`
    SELECT entry_id AS "entryId", week, event_type AS "eventType" FROM pick_result_notifications
  `) as { entryId: string; week: number; eventType: string }[];
  return new Set(rows.map((r) => `${r.entryId}:${r.week}:${r.eventType}`));
}

/** Record that an (entry, week, event_type) notification has been sent (idempotent). */
export async function markNotified(entryId: string, week: number, eventType: string, detail: string): Promise<void> {
  await sql`
    INSERT INTO pick_result_notifications (entry_id, week, event_type, result)
    VALUES (${entryId}, ${week}, ${eventType}, ${detail})
    ON CONFLICT (entry_id, week, event_type) DO NOTHING
  `;
}
