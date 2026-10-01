import { createConversation, createResponse, extractAgentMessages, frameForRouting, getConversationMessages, stripFraming } from "@/lib/klaviyo";
import { getSessionUser } from "@/lib/session";
import { recordConversation, getConversationOwner } from "@/lib/db/chat-repo";
import { errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";

export async function POST(req: Request) {
  // Chat is per-user: require a session so the conversation can be tied to the
  // signed-in user's Klaviyo profile (and so the agent acts on their behalf).
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const message: string = body?.message ?? "";
  let conversationId: string | undefined = body?.conversationId;
  if (!message.trim()) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "message is required" }]), 400);
  }
  try {
    if (!conversationId) {
      conversationId = await createConversation({ email: user.email, name: user.name });
      // Remember who owns it so the transcript GET can be authorized (best-effort).
      await recordConversation(conversationId, user.id).catch(() => {});
    }
    const events = await createResponse(conversationId, frameForRouting(message, user.id));
    return jsonApi({ conversationId, messages: extractAgentMessages(events) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[chat] failed:", detail);
    return jsonApi(errorDocument([{ status: "502", title: "Assistant unavailable", detail }]), 502);
  }
}

/**
 * Return a conversation's transcript so the client can reconcile on mount — this is what makes a
 * reply survive the page dying mid-request (e.g. an iOS PWA evicted while backgrounded): Klaviyo
 * stored the agent turn even though the POST response never reached us. Authorized to the owner.
 */
export async function GET(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "conversationId is required" }]), 400);
  }
  const owner = await getConversationOwner(conversationId);
  // Only the owner may read it. Unknown conversations (owner === null) are treated as not found
  // rather than leaking existence.
  if (owner !== user.id) {
    return jsonApi(errorDocument([{ status: "404", title: "Not found", detail: "No such conversation" }]), 404);
  }
  try {
    const messages = (await getConversationMessages(conversationId)).map((m) => ({
      role: m.role,
      text: m.role === "user" ? stripFraming(m.content) : m.content,
    }));
    return jsonApi({ conversationId, messages });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[chat] transcript fetch failed:", detail);
    return jsonApi(errorDocument([{ status: "502", title: "Assistant unavailable", detail }]), 502);
  }
}
