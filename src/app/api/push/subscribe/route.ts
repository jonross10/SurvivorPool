import { getSessionUser } from "@/lib/session";
import { saveSubscription, deleteSubscription, type WebPushSubscription } from "@/lib/db/push-repo";
import { upsertProfile, trackEvent, PUSH_ENABLED_METRIC, PUSH_DISABLED_METRIC } from "@/lib/klaviyo";
import { metaDocument, errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";

function isValidSub(s: unknown): s is WebPushSubscription {
  const sub = s as WebPushSubscription;
  return !!sub && typeof sub.endpoint === "string" && !!sub.keys &&
    typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
}

/** Store the current user's browser push subscription and link their Klaviyo profile. */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  if (!isValidSub(sub)) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid subscription", detail: "A valid push subscription is required" }]), 400);
  }
  await saveSubscription(user.id, sub);
  // Link external_id and set push_enabled=true so notification flows can filter on it,
  // plus emit an event flows can trigger on. All best-effort.
  if (user.email) {
    try { await upsertProfile(user.email, { externalId: user.id, properties: { push_enabled: true } }); } catch { /* non-fatal */ }
    try { await trackEvent(user.email, PUSH_ENABLED_METRIC); } catch { /* non-fatal */ }
  }
  return jsonApi(metaDocument({ ok: true }), 201);
}

/** Remove a subscription (called when the user turns notifications off). */
export async function DELETE(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "endpoint is required" }]), 400);
  }
  await deleteSubscription(endpoint);
  if (user.email) {
    try { await upsertProfile(user.email, { properties: { push_enabled: false } }); } catch { /* non-fatal */ }
    try { await trackEvent(user.email, PUSH_DISABLED_METRIC); } catch { /* non-fatal */ }
  }
  return jsonApi(metaDocument({ ok: true }));
}
