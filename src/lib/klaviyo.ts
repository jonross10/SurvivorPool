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
 *
 * When the user is signed in, we also embed their (server-verified) opaque account id
 * so the agent treats them as pre-authenticated and passes the id to our tools — the
 * Customer Agent API has no shopper-auth mechanism, so we assert it from the trusted
 * host app instead. The id is injected server-side; the client cannot spoof it. We pass
 * the id (not the email) to avoid piping PII through the agent.
 */
export function frameForRouting(message: string, userId?: string): string {
  if (!userId) return `(NFL survivor pool assistant) ${message}`;
  return (
    `(NFL survivor pool assistant — the shopper is already authenticated by the host app; ` +
    `their account id is ${userId}; never ask them to log in, and pass this account id to ` +
    `all tool calls.) ${message}`
  );
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

/** Metric name the magic-link email flow is triggered by (build the flow in Klaviyo). */
export const MAGIC_LINK_METRIC = "Magic Link Requested";

/**
 * Trigger the passwordless sign-in email by tracking a Klaviyo event that a flow
 * listens for. The flow's email renders {{ event.magic_link_url }}. Identifies (and
 * creates if needed) the profile by email. The link token is short-lived (5 min).
 */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) throw new Error("KLAVIYO_API_KEY is not set");
  const res = await fetch(`${BASE}/events`, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: "2026-07-15",
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          metric: { data: { type: "metric", attributes: { name: MAGIC_LINK_METRIC } } },
          profile: { data: { type: "profile", attributes: { email } } },
          properties: { magic_link_url: url },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo event failed: ${res.status} ${await res.text()}`);
}

export interface ConversationCustomer {
  email: string;
  name?: string;
}

/** Split a display name into Klaviyo's first_name / last_name (best-effort). */
function splitName(name?: string): { first_name?: string; last_name?: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || undefined };
}

/**
 * Create a Customer Agent conversation tied to the signed-in user's Klaviyo profile
 * (matched by email). Attaching the customer lets the agent inject that profile's
 * Email into its custom-tool calls back to our API, which we map to the user.
 * Returns the conversation id.
 */
export async function createConversation(customer: ConversationCustomer): Promise<string> {
  const res = await fetch(`${BASE}/customer-agent-conversations`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      data: {
        type: "customer-agent-conversation",
        attributes: {
          mode: mode(),
          channel: "web-chat",
          customer: { email: customer.email, ...splitName(customer.name) },
        },
      },
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
