import { sql } from "./client";

export interface NotificationPrefs {
  notifyFinal: boolean; // win/loss results
  notifyLive: boolean; // halftime + close-game updates
}

export const DEFAULT_PREFS: NotificationPrefs = { notifyFinal: true, notifyLive: true };

interface PrefRow { userId: string; notifyFinal: boolean; notifyLive: boolean }

/** A user's prefs, defaulting both to on when no row exists. */
export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  const rows = (await sql`
    SELECT notify_final AS "notifyFinal", notify_live AS "notifyLive"
    FROM notification_prefs WHERE user_id = ${userId}
  `) as Pick<PrefRow, "notifyFinal" | "notifyLive">[];
  return rows[0] ?? DEFAULT_PREFS;
}

/** All stored prefs as a map; callers treat a missing user as DEFAULT_PREFS. */
export async function getAllPrefs(): Promise<Map<string, NotificationPrefs>> {
  const rows = (await sql`
    SELECT user_id AS "userId", notify_final AS "notifyFinal", notify_live AS "notifyLive"
    FROM notification_prefs
  `) as PrefRow[];
  return new Map(rows.map((r) => [r.userId, { notifyFinal: r.notifyFinal, notifyLive: r.notifyLive }]));
}

/** Upsert a user's prefs. */
export async function setPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await sql`
    INSERT INTO notification_prefs (user_id, notify_final, notify_live, updated_at)
    VALUES (${userId}, ${prefs.notifyFinal}, ${prefs.notifyLive}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET notify_final = EXCLUDED.notify_final, notify_live = EXCLUDED.notify_live, updated_at = now()
  `;
}
