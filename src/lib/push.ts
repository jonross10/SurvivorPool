import webpush from "web-push";
import { getSubscriptionsForUser, deleteSubscription } from "./db/push-repo";

let configured = false;
function configure(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) are not set");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // in-app path to open when the notification is tapped
}

/** Send a notification to every device a user has subscribed; prune dead subscriptions. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  configure();
  const subs = await getSubscriptionsForUser(userId);
  let sent = 0;
  let pruned = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
      } catch (e) {
        // 404/410 mean the subscription is gone — remove it so we stop trying.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deleteSubscription(sub.endpoint);
          pruned++;
        }
      }
    }),
  );
  return { sent, pruned };
}
