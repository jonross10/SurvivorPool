import { getSessionUser } from "@/lib/session";
import { saveSubscription, deleteSubscription, type WebPushSubscription } from "@/lib/db/push-repo";
import { linkProfileExternalId } from "@/lib/klaviyo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

function isValidSub(s: unknown): s is WebPushSubscription {
  const sub = s as WebPushSubscription;
  return !!sub && typeof sub.endpoint === "string" && !!sub.keys &&
    typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
}

/** Store the current user's browser push subscription and link their Klaviyo profile. */
export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription;
  if (!isValidSub(sub)) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid subscription", detail: "A valid push subscription is required" }]), 400);
  }
  await saveSubscription(user.id, sub);
  // Link the Klaviyo profile so flows can target this user via {{ person.external_id }}.
  if (user.email) {
    try { await linkProfileExternalId(user.email, user.id); } catch { /* non-fatal */ }
  }
  return jsonApi(metaDocument({ ok: true }), 201);
}

/** Remove a subscription (called when the user turns notifications off). */
export async function DELETE(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const body = await req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "endpoint is required" }]), 400);
  }
  await deleteSubscription(endpoint);
  return jsonApi(metaDocument({ ok: true }));
}
