// TEMPORARY: lets a signed-in user fire the full push pathway (event -> Klaviyo flow
// webhook -> /api/push/send -> browser). Remove once real flows are set up.
import { getSessionUser } from "@/lib/session";
import { linkProfileExternalId, trackEvent, TEST_PUSH_METRIC } from "@/lib/klaviyo";
import { metaDocument, errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  if (!user.email) return jsonApi(errorDocument([{ status: "400", title: "No email", detail: "Account has no email" }]), 400);
  // Ensure external_id is linked so the flow can target {{ person.external_id }}.
  await linkProfileExternalId(user.email, user.id);
  // Fire the event the "Test Push" flow is triggered by. The flow's webhook action
  // calls /api/push/send with these properties.
  await trackEvent(user.email, TEST_PUSH_METRIC, {
    // Carry the user id as an event property — {{ event.user_id }} resolves reliably in
    // Klaviyo webhook bodies, whereas {{ person.external_id }} renders empty there.
    user_id: user.id,
    push_title: "Survivor Assistant",
    push_body: "🔔 Test via Klaviyo flow — push is working!",
    push_url: "/",
  });
  return jsonApi(metaDocument({ queued: true }));
}
