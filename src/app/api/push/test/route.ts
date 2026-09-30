// TEMPORARY: lets a signed-in user send themselves a test push. Remove once flows are set up.
import { getSessionUser } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const result = await sendPushToUser(user.id, {
    title: "Survivor Assistant",
    body: "🔔 Test notification — push is working!",
    url: "/",
  });
  return jsonApi(metaDocument(result));
}
