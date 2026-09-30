import { sendPushToUser } from "@/lib/push";
import { getUserIdByEmail } from "@/lib/db/users-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

/**
 * Send a web-push notification to a user. Called by Klaviyo Flow webhook actions (or any
 * trusted automation) — authenticated with the shared API_KEY via X-API-Key. Identify the
 * user by `userId` (= our ULID, e.g. {{ person.external_id }}) or `email`.
 */
export async function POST(req: Request) {
  const apiKey = process.env.API_KEY;
  if (!apiKey || req.headers.get("x-api-key") !== apiKey) {
    return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Valid API key required" }]), 401);
  }

  // TEMP debug: capture exactly what the Klaviyo flow webhook sends.
  const raw = await req.text();
  console.log("[push/send] raw body:", raw);
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch (e) { console.log("[push/send] JSON parse failed:", e instanceof Error ? e.message : e); }
  const title: unknown = body?.title;
  const message: unknown = body?.body;
  const url: unknown = body?.url;
  if (typeof title !== "string" || !title.trim() || typeof message !== "string" || !message.trim()) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid payload", detail: "title and body are required" }]), 400);
  }

  // Trim — Klaviyo-templated values can arrive with stray whitespace/newlines.
  let userId: string | null = typeof body?.userId === "string" ? body.userId.trim() || null : null;
  if (!userId && typeof body?.email === "string") userId = await getUserIdByEmail(body.email.trim());
  console.log("[push/send] resolved userId:", JSON.stringify(userId));
  if (!userId) {
    return jsonApi(errorDocument([{ status: "400", title: "Unknown recipient", detail: "userId or a known email is required" }]), 400);
  }

  const result = await sendPushToUser(userId, {
    title,
    body: message,
    url: typeof url === "string" ? url : undefined,
  });
  return jsonApi(metaDocument(result));
}
