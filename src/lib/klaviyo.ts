import { KLAVIYO_BASE as BASE, KLAVIYO_REVISION_BETA, klaviyoHeaders } from "./klaviyo-http";

// Customer Agent (beta) endpoints use the beta revision; agentHeaders wraps that.
const agentHeaders = () => klaviyoHeaders(KLAVIYO_REVISION_BETA);

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

function mode(): "preview" | "live" {
  return process.env.KLAVIYO_AGENT_MODE === "live" ? "live" : "preview";
}

/** Metric name the magic-link email flow is triggered by (build the flow in Klaviyo). */
export const MAGIC_LINK_METRIC = "Magic Link Requested";
export const PUSH_ENABLED_METRIC = "Push Enabled";
export const PUSH_DISABLED_METRIC = "Push Disabled";
export const SIGNED_UP_METRIC = "Signed Up";
export const TEST_PUSH_METRIC = "Test Push Requested";
export const PICK_RESULT_METRIC = "Pick Result";

/**
 * Track a Klaviyo event on a profile (identified by email, created if needed). Powers
 * flow triggers. `properties` are exposed to the flow as {{ event.<key> }}.
 */
async function postEvent(
  profileAttributes: Record<string, unknown>,
  metricName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${BASE}/events`, {
    method: "POST",
    headers: klaviyoHeaders(),
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          metric: { data: { type: "metric", attributes: { name: metricName } } },
          profile: { data: { type: "profile", attributes: profileAttributes } },
          properties,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Klaviyo event failed: ${res.status} ${await res.text()}`);
}

/** Track an event on a profile identified by email. */
export async function trackEvent(email: string, metricName: string, properties: Record<string, unknown> = {}): Promise<void> {
  await postEvent({ email }, metricName, properties);
}

/** Track an event on a profile identified by external_id (= our user id). */
export async function trackEventByExternalId(externalId: string, metricName: string, properties: Record<string, unknown> = {}): Promise<void> {
  await postEvent({ external_id: externalId }, metricName, properties);
}

/**
 * Upsert a Klaviyo profile by email: set `external_id` (links to our user) and/or custom
 * `properties` (e.g. push_enabled, which notification flows filter on). Create; on 409
 * PATCH the existing profile (PATCH merges custom properties, doesn't wipe others).
 * Best-effort — callers wrap in try/catch.
 */
export async function upsertProfile(
  email: string,
  opts: { externalId?: string; properties?: Record<string, unknown> } = {},
): Promise<void> {
  const attributes: Record<string, unknown> = { email };
  if (opts.externalId) attributes.external_id = opts.externalId;
  if (opts.properties) attributes.properties = opts.properties;
  const create = await fetch(`${BASE}/profiles`, {
    method: "POST",
    headers: klaviyoHeaders(),
    body: JSON.stringify({ data: { type: "profile", attributes } }),
  });
  if (create.status === 201) return;
  if (create.status === 409) {
    const doc = await create.json().catch(() => ({}));
    const id = doc?.errors?.[0]?.meta?.duplicate_profile_id;
    if (!id) return;
    const patch: Record<string, unknown> = {};
    if (opts.externalId) patch.external_id = opts.externalId;
    if (opts.properties) patch.properties = opts.properties;
    await fetch(`${BASE}/profiles/${id}`, {
      method: "PATCH",
      headers: klaviyoHeaders(),
      body: JSON.stringify({ data: { type: "profile", id, attributes: patch } }),
    });
  }
}

/** Link a profile to our user id via external_id (thin wrapper over upsertProfile). */
export async function linkProfileExternalId(email: string, externalId: string): Promise<void> {
  await upsertProfile(email, { externalId });
}

/**
 * Trigger the passwordless sign-in email by tracking a Klaviyo event that a flow
 * listens for. The flow's email renders {{ event.magic_link_url }}. Identifies (and
 * creates if needed) the profile by email. The link token is short-lived (5 min).
 */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  await trackEvent(email, MAGIC_LINK_METRIC, { magic_link_url: url });
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
    headers: agentHeaders(),
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
    headers: agentHeaders(),
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
