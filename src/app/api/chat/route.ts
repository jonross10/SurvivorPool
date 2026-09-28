import { createConversation, createResponse, extractAgentMessages, frameForRouting } from "@/lib/klaviyo";
import { errorDocument, jsonApi } from "@/lib/jsonapi";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message: string = body?.message ?? "";
  let conversationId: string | undefined = body?.conversationId;
  if (!message.trim()) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "message is required" }]), 400);
  }
  try {
    if (!conversationId) conversationId = await createConversation();
    const events = await createResponse(conversationId, frameForRouting(message));
    return jsonApi({ conversationId, messages: extractAgentMessages(events) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[chat] failed:", detail);
    return jsonApi(errorDocument([{ status: "502", title: "Assistant unavailable", detail }]), 502);
  }
}
