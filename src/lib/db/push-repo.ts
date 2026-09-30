import { sql } from "./client";
import { newId } from "../ids";

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Store (or refresh) a browser push subscription for a user. Keyed by endpoint. */
export async function saveSubscription(userId: string, sub: WebPushSubscription): Promise<void> {
  await sql`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    VALUES (${newId()}, ${userId}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint)
    DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

/** Every push subscription for a user (they may have several devices). */
export async function getSubscriptionsForUser(userId: string): Promise<WebPushSubscription[]> {
  const rows = (await sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}
  `) as { endpoint: string; p256dh: string; auth: string }[];
  return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
}

/** Remove a subscription (e.g. after the push service reports it's gone: 404/410). */
export async function deleteSubscription(endpoint: string): Promise<void> {
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}
