const BASE = "https://a.klaviyo.com/api";
const REVISION = "2026-07-15.pre";

export interface AgentEvent {
  type: string;
  role?: string;
  content?: string;
  [k: string]: unknown;
}

/** Pull the agent's text replies out of a Customer Agent response event list. */
export function extractAgentMessages(events: AgentEvent[] | undefined): string[] {
  return (events ?? [])
    .filter((e) => e.type === "message" && e.role === "agent" && typeof e.content === "string")
    .map((e) => e.content as string);
}

/**
 * Prepend a survivor-pool context tag to the message we send Klaviyo so its skill
 * router picks our Survivor Strategy skill instead of the prebuilt e-commerce
 * "General Q&A" (which can't be disabled or edited). The UI still shows the user's
 * original text — only the routed copy is tagged.
 */
export function frameForRouting(message: string): string {
  return `(NFL survivor pool assistant) ${message}`;
}

function headers(): Record<string, string> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error("KLAVIYO_API_KEY is not set");
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}

function mode(): "preview" | "live" {
  return process.env.KLAVIYO_AGENT_MODE === "live" ? "live" : "preview";
}

/** Create a Customer Agent conversation; returns its id. */
export async function createConversation(): Promise<string> {
  const res = await fetch(`${BASE}/customer-agent-conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: { type: "customer-agent-conversation", attributes: { mode: mode(), channel: "web-chat" } },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo conversation create failed: ${res.status}`);
  const doc = await res.json();
  return doc.data.id as string;
}

/** Send a user message to an existing conversation; returns the agent's reply events. */
export async function createResponse(conversationId: string, message: string): Promise<AgentEvent[]> {
  const res = await fetch(`${BASE}/customer-agent-responses`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "customer-agent-response",
        attributes: { mode: mode(), messages: [{ role: "user", content: message }] },
        relationships: { conversation: { data: { type: "customer-agent-conversation", id: conversationId } } },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo response failed: ${res.status}`);
  const doc = await res.json();
  return (doc.data?.attributes?.events ?? []) as AgentEvent[];
}
