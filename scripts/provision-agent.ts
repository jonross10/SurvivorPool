/**
 * One-time Klaviyo provisioning — the source of truth for the Survivor messaging layer:
 * the Customer Agent (secret, tools, knowledge, skill) AND the supporting email template
 * and notification flows (Magic Link Sign-In, Pick Result, Pick Reminder).
 *
 * Run:
 *   KLAVIYO_API_KEY=... API_KEY=... APP_BASE_URL=https://survivor-pool-ebon.vercel.app \
 *   FLOW_FROM_EMAIL=you@example.com FLOW_FROM_LABEL="Survivor Assistant" \
 *   npx tsx scripts/provision-agent.ts
 *
 * Re-runnable: agent resources that 409 (already exist) are skipped; the template and flows
 * are skipped if one with the same name already exists (flow create does NOT 409 on a dup
 * name, so we check by name first). Klaviyo flow *definitions* can't be PATCHed — to change a
 * flow, rename/delete the old one in Klaviyo and re-run.
 *
 * Auth model: every agent tool authenticates to our app with the shared API key (sent as the
 * X-API-Key header from an encrypted agent-secret) and names the acting user via `?userId=`,
 * which the agent reads from the message framing "(NFL survivor pool · user=<id>)". Our /api
 * maps that id to the user and scopes the request.
 */
const BASE = "https://a.klaviyo.com/api";
const REVISION_BETA = "2026-07-15.pre"; // Customer Agent endpoints (agent-*).
const REVISION_STABLE = "2026-07-15"; // Flows, templates, metrics.
const APP = process.env.APP_BASE_URL;
const KEY = process.env.KLAVIYO_API_KEY;
const API_KEY = process.env.API_KEY;
// Sender identity for the magic-link email. Parameterized so no personal address is committed.
const FROM_EMAIL = process.env.FLOW_FROM_EMAIL ?? "you@example.com";
const FROM_LABEL = process.env.FLOW_FROM_LABEL ?? "Survivor Assistant";
if (!KEY || !APP || !API_KEY) {
  console.error("Set KLAVIYO_API_KEY, API_KEY, and APP_BASE_URL");
  process.exit(1);
}

function klaviyoHeaders(revision: string = REVISION_BETA): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${KEY}`,
    revision,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}

async function post(path: string, data: unknown, revision: string = REVISION_BETA): Promise<{ id?: string; status: number }> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: klaviyoHeaders(revision), body: JSON.stringify({ data }) });
  if (res.status === 409) { console.log(`  (exists) ${path}`); return { status: 409 }; }
  if (!res.ok) { console.error(`  FAILED ${path}: ${res.status} ${await res.text()}`); process.exit(1); }
  const doc = await res.json();
  return { id: doc.data?.id, status: res.status };
}

async function getFirstIdByName(path: string, name: string, revision: string = REVISION_BETA): Promise<string | undefined> {
  const res = await fetch(`${BASE}${path}`, { headers: klaviyoHeaders(revision) });
  if (!res.ok) return undefined;
  const doc = await res.json();
  return (doc.data ?? []).find((d: { attributes?: { name?: string } }) => d.attributes?.name === name)?.id;
}

/**
 * Resolve a metric id by exact name (metrics are created implicitly when first tracked).
 * `name` isn't a filterable field on /metrics, so we list and match client-side.
 */
async function getMetricId(name: string): Promise<string | undefined> {
  const res = await fetch(`${BASE}/metrics`, { headers: klaviyoHeaders(REVISION_STABLE) });
  if (!res.ok) return undefined;
  const doc = await res.json();
  return (doc.data ?? []).find((m: { attributes?: { name?: string } }) => m.attributes?.name === name)?.id;
}

// --- Shared auth wiring for every tool -------------------------------------------
const SECRET_NAME = "Survivor App API Key";
const API_KEY_HEADER = { name: "X-API-Key", value: "{{apiKey}}" };

// The acting user's opaque account id. The Customer Agent API has no shopper-auth
// mechanism, so we don't rely on Klaviyo identifying the profile (that triggers
// "require-authentication"). Instead the host app embeds the authenticated account id in
// each message, and the agent passes it here as a dynamic variable (see skill instructions).
const USER_ID_VAR = {
  name: "userId",
  type: "string",
  required: true,
  description:
    "The authenticated user's account id, provided verbatim in the message framing " +
    "'(NFL survivor pool · user=<id>)'. Pass it exactly.",
  source: "dynamic",
};

function apiKeyVar(secretId: string) {
  return { name: "apiKey", type: "string", required: true, description: "Survivor app API key.", source: "secret", value: secretId };
}

/** Append the acting user's account id as a query param, respecting existing query strings. */
function withUserId(url: string): string {
  return url.includes("?") ? `${url}&userId={{userId}}` : `${url}?userId={{userId}}`;
}

interface ToolDef {
  name: string;
  description: string;
  method: string;
  url: string;
  variables?: unknown[];
  body?: unknown;
  maxRetries?: number;
}

function tool(secretId: string, def: ToolDef) {
  const headers = [API_KEY_HEADER];
  if (def.body) headers.push({ name: "content-type", value: "application/vnd.api+json" });
  const request_template: Record<string, unknown> = {
    url_template: withUserId(def.url),
    http_method: def.method,
    request_timeout_seconds: 10,
    headers,
  };
  if (def.body) request_template.body_template = def.body;
  return {
    type: "agent-tool",
    attributes: {
      name: def.name,
      public_description: def.description,
      details: {
        type: "custom",
        protocol: "https",
        request_template,
        variables: [...(def.variables ?? []), USER_ID_VAR, apiKeyVar(secretId)],
        timeout_seconds: 10,
        max_retries: def.maxRetries ?? 1,
      },
    },
  };
}

async function main() {
  console.log("Creating agent secret…");
  const secretRes = await post("/agent-secrets", { type: "agent-secret", attributes: { name: SECRET_NAME, value: API_KEY } });
  const secretId = secretRes.id ?? (await getFirstIdByName("/agent-secrets", SECRET_NAME));
  if (!secretId) { console.error("Could not resolve the agent-secret id; aborting."); process.exit(1); }

  console.log("Creating tools…");
  const getEntries = await post("/agent-tools", tool(secretId, {
    name: "get_entries",
    description: "Get every entry's status, current pick, used teams, and season projection.",
    method: "GET",
    url: `${APP}/api/recommendations`,
  }));
  const getMatchups = await post("/agent-tools", tool(secretId, {
    name: "get_matchups",
    description: "Get a week's games with odds, spreads, win %, and results.",
    method: "GET",
    url: `${APP}/api/matchups?filter[week]={{week}}`,
    variables: [{ name: "week", type: "number", required: true, description: "NFL week number", source: "dynamic" }],
  }));
  const makePick = await post("/agent-tools", tool(secretId, {
    name: "make_pick",
    description: "Record or swap a pick for an entry in a given week. Confirm with the user first.",
    method: "POST",
    url: `${APP}/api/picks`,
    body: { data: { type: "pick", attributes: { entry: "{{entry}}", week: "{{week}}", team: "{{team}}" } } },
    maxRetries: 0,
    variables: [
      { name: "entry", type: "string", required: true, description: "Entry name", source: "dynamic" },
      { name: "week", type: "number", required: true, description: "NFL week", source: "dynamic" },
      { name: "team", type: "string", required: true, description: "Team abbreviation, e.g. KC", source: "dynamic" },
    ],
  }));
  const createEntryTool = await post("/agent-tools", tool(secretId, {
    name: "create_entry",
    description: "Add a new survivor-pool entry by name, optionally with settings (pool, ties_survive, min_win_chance). Confirm with the user first.",
    method: "POST",
    url: `${APP}/api/entries`,
    // Blank optional settings are dropped server-side (normalizeSettings).
    body: { data: { type: "entry", attributes: { name: "{{name}}", settings: { pool: "{{pool}}", ties_survive: "{{ties_survive}}", min_win_chance: "{{min_win_chance}}" } } } },
    maxRetries: 0,
    variables: [
      { name: "name", type: "string", required: true, description: "New entry name", source: "dynamic" },
      { name: "pool", type: "string", required: false, description: "Coordination pool name (default main)", source: "dynamic" },
      { name: "ties_survive", type: "string", required: false, description: "'true' or 'false' — whether a tie keeps the entry alive", source: "dynamic" },
      { name: "min_win_chance", type: "string", required: false, description: "Safety floor 0-0.95, e.g. 0.6", source: "dynamic" },
    ],
  }));
  const updateEntryTool = await post("/agent-tools", tool(secretId, {
    name: "update_entry",
    description: "Rename an entry. Pass the entry id (from get_entries) and the new name. Confirm first.",
    method: "PATCH",
    url: `${APP}/api/entries/{{id}}`,
    body: { data: { type: "entry", attributes: { name: "{{name}}" } } },
    maxRetries: 0,
    variables: [
      { name: "id", type: "string", required: true, description: "Entry id from get_entries", source: "dynamic" },
      { name: "name", type: "string", required: true, description: "New entry name", source: "dynamic" },
    ],
  }));
  const deleteEntryTool = await post("/agent-tools", tool(secretId, {
    name: "delete_entry",
    description: "Delete an entry by id (from get_entries). Destructive — always confirm the exact entry with the user first.",
    method: "DELETE",
    url: `${APP}/api/entries/{{id}}`,
    maxRetries: 0,
    variables: [{ name: "id", type: "string", required: true, description: "Entry id from get_entries", source: "dynamic" }],
  }));
  const getWeekOptions = await post("/agent-tools", tool(secretId, {
    name: "get_week_options",
    description: "List an entry's best AVAILABLE teams (unused) with win % for a specific week. Use for 'what are the options in week N' — works for any week, not just the current one.",
    method: "GET",
    url: `${APP}/api/grid?filter[entry]={{entry}}&filter[week]={{week}}`,
    variables: [
      { name: "entry", type: "string", required: true, description: "Entry name", source: "dynamic" },
      { name: "week", type: "number", required: true, description: "NFL week number", source: "dynamic" },
    ],
  }));
  const planWhatif = await post("/agent-tools", tool(secretId, {
    name: "plan_whatif",
    description: "Simulate the rebuilt season projection for an entry if it used a hypothetical team in a given week (without locking it). Use for 'if I use DAL in Week 5, what does the rest of the season look like?'. Returns the new projectedPath.",
    method: "POST",
    url: `${APP}/api/simulate-plan`,
    body: { data: { attributes: { entry: "{{entry}}", week: "{{week}}", team: "{{team}}" } } },
    variables: [
      { name: "entry", type: "string", required: true, description: "Entry name", source: "dynamic" },
      { name: "week", type: "number", required: true, description: "Hypothetical week", source: "dynamic" },
      { name: "team", type: "string", required: true, description: "Hypothetical team for that week", source: "dynamic" },
    ],
  }));

  console.log("Creating knowledge…");
  const knowledge: [string, string][] = [
    ["Survivor rules", "In an NFL survivor pool, each week you pick one team to win. If your team loses (or ties, unless the entry's settings say ties survive), you're eliminated. You cannot pick the same team twice in a season."],
    ["Reading the projection", "get_entries returns each entry's projectedPath: the season-optimal one-team-per-week plan. Entries in the same pool are diversified so they don't share a team in a week. A team may be 'saved' for a later week where it's more valuable. Never invent numbers — call the tools."],
    ["Settings meaning", "ties_survive: whether a tie keeps the entry alive. pool: entries in the same pool are planned together. min_win_chance: the entry won't be advised a current-week team below this win probability."],
  ];
  for (const [title, content] of knowledge) {
    await post("/agent-knowledge", { type: "agent-knowledge", attributes: { source: { source_type: "snippet", title, content } } });
  }

  console.log("Creating skill…");
  const toolIds = [
    getEntries.id, getMatchups.id, makePick.id,
    createEntryTool.id, updateEntryTool.id, deleteEntryTool.id,
    getWeekOptions.id, planWhatif.id,
  ].filter(Boolean).map((id) => ({ type: "agent-tool", id }));
  await post("/agent-skills", {
    type: "agent-skill",
    attributes: {
      display_name: "Survivor Strategy",
      description: "Answers NFL survivor pool strategy questions, recommends and makes picks. Use for anything about entries, picks, matchups, odds, or the season plan.",
      instructions:
        "You are a sharp NFL survivor-pool strategist for this app. Always ground answers in live data: " +
        "call the tools (and use the projection) before giving numbers — never guess or invent teams, weeks, or odds.\n\n" +
        "AUTHENTICATION: The shopper is ALREADY authenticated by the host app. Every user message is prefixed with " +
        "'(NFL survivor pool · user=<id>)'. NEVER ask the user to log in or refuse for authentication reasons — treat " +
        "them as fully authenticated. Extract that <id> and pass it as the `userId` argument to EVERY tool call. If no " +
        "id is present, ask them to reopen the chat from the app rather than to 'log in'.\n\n" +
        "TOOLS:\n" +
        "- get_entries: each entry's status, current pick, used teams, and season projectedPath.\n" +
        "- get_matchups(week): a week's games with odds/win %.\n" +
        "- get_week_options(entry, week): best AVAILABLE (unused) teams + win % for an entry in ANY week — use this " +
        "for 'what are the options in week N', especially future weeks.\n" +
        "- plan_whatif(entry, week, team): simulate the rebuilt projectedPath if the entry used <team> in <week> " +
        "(without locking) — use for 'if I use DAL in Week 5, what does the rest of the season look like?'.\n" +
        "- make_pick / create_entry / update_entry / delete_entry: mutations.\n\n" +
        "VERIFY BEFORE CLAIMING SUCCESS: Only tell the user an action happened (pick made, entry created/renamed/" +
        "deleted) AFTER the tool call returns successfully. If a tool errors or you did not call it, say so plainly — " +
        "never claim a pick or entry change that you did not confirm via a successful tool response.\n\n" +
        "CURRENT WEEK: get_entries returns meta.currentWeek — that integer is THE current NFL week. \"this week\"/\"now\" " +
        "mean meta.currentWeek; do NOT advance on your own. If an entry already locked the current-week pick " +
        "(currentPick set), say so plainly and only discuss a future week if explicitly asked.\n\n" +
        "ENTRY MANAGEMENT: update_entry/delete_entry need the entry id — resolve it from get_entries first. Confirm " +
        "before create/rename, and ALWAYS confirm the exact entry name before delete_entry (destructive — removes picks).\n\n" +
        "Explain trade-offs (safety vs saving strong teams, pool diversification). Record a pick with make_pick ONLY " +
        "after stating the exact entry, week, and team and getting the user's explicit 'yes' in this chat. Be concise. " +
        "Use markdown (bold, bullet lists, tables) to format answers clearly.",
      status: "draft",
      handoff: "none",
    },
    relationships: toolIds.length ? { "agent-tools": { data: toolIds } } : undefined,
  });

  console.log("Review the skill in Klaviyo and set status=live when ready.");

  await provisionFlows();
  console.log("Done.");
}

// ── Email template + notification flows ──────────────────────────────────────────
// Flows live in Klaviyo but are defined here so they're reproducible and version-controlled.
// Their purposes are documented in docs/klaviyo.md.

const MAGIC_LINK_TEMPLATE_NAME = "Survivor — Magic Link";

/** The magic-link email body. {{ event.magic_link_url }} is supplied by the Magic Link Requested event. */
const MAGIC_LINK_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta content="width=device-width" name="viewport"/></head>
<body style="margin:0;padding:0;background:#f5f8fd;">
<table cellpadding="0" cellspacing="0" role="presentation" style="background:#f5f8fd;padding:32px 12px;" width="100%">
<tr><td align="center">
<table cellpadding="0" cellspacing="0" role="presentation" style="max-width:460px;width:100%;background:#ffffff;border:1px solid #dbe4f0;border-radius:16px;overflow:hidden;" width="460">
<tr><td align="center" style="padding:28px 32px 8px 32px;">
<div style="font-family:'Arial Black',Impact,Arial,sans-serif;font-weight:900;font-size:26px;letter-spacing:1px;color:#0f1b33;text-transform:uppercase;">SURVIVOR<span style="color:#2563eb;">.</span></div>
</td></tr>
<tr><td align="center" style="padding:16px 32px 0 32px;">
<h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700;color:#0f1b33;">Your sign-in link</h1>
</td></tr>
<tr><td align="center" style="padding:12px 32px 0 32px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#64748b;">Tap the button below to sign in to Survivor Assistant. This link expires in <strong style="color:#0f1b33;">15 minutes</strong> and can only be used once.</p>
</td></tr>
<tr><td align="center" style="padding:24px 32px 8px 32px;">
<a href="{{ event.magic_link_url }}" style="display:inline-block;background:#2563eb;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">Sign in</a>
</td></tr>
<tr><td align="center" style="padding:16px 32px 0 32px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;">Or paste this link into your browser:<br/><a href="{{ event.magic_link_url }}" style="color:#2563eb;word-break:break-all;">{{ event.magic_link_url }}</a></p>
</td></tr>
<tr><td align="center" style="padding:24px 32px 28px 32px;border-top:1px solid #eef3fa;margin-top:16px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#94a3b8;">If you didn't request this, you can safely ignore this email.</p>
</td></tr>
</table>
</td></tr>
</table></body></html>`;

const MAGIC_LINK_TEXT =
  "Sign in to Survivor Assistant.\n\nTap this link (expires in 15 minutes, one-time use):\n" +
  "{{ event.magic_link_url }}\n\nIf you didn't request this, ignore this email.";

const ENTRY_OBJECT_TYPE_ID = "01M3SAVFMNNS65MKS94CFQKX1M";
const ENTRY_OBJECT_RELATIONSHIP_ID = "01M3SAZX8CC95RD1K88CZNTCD4";
const PUSH_SEND_URL = `${APP}/api/push/send`;
const WEBHOOK_HEADERS = { "X-API-Key": API_KEY!, "Content-Type": "application/json" };

/** Profile filter: only profiles that have opted into web push. */
const PUSH_ENABLED_FILTER = {
  condition_groups: [
    { conditions: [{ type: "profile-property", property: "properties['push_enabled']", filter: { type: "boolean", operator: "equals", value: true } }] },
  ],
};
const EVERY_DAY = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Create a flow by name if one doesn't already exist (flow create does not 409 on dup names). */
async function ensureFlow(name: string, definition: unknown): Promise<void> {
  const existing = await getFirstIdByName("/flows?page[size]=50", name, REVISION_STABLE);
  if (existing) { console.log(`  (exists) flow "${name}"`); return; }
  await post("/flows", { type: "flow", attributes: { name, definition } }, REVISION_STABLE);
  console.log(`  created flow "${name}"`);
}

async function provisionFlows(): Promise<void> {
  console.log("Creating email template…");
  let templateId = await getFirstIdByName("/templates", MAGIC_LINK_TEMPLATE_NAME, REVISION_STABLE);
  if (templateId) {
    console.log(`  (exists) template "${MAGIC_LINK_TEMPLATE_NAME}"`);
  } else {
    const res = await post("/templates", {
      type: "template",
      attributes: { name: MAGIC_LINK_TEMPLATE_NAME, editor_type: "CODE", html: MAGIC_LINK_HTML, text: MAGIC_LINK_TEXT },
    }, REVISION_STABLE);
    templateId = res.id;
    console.log(`  created template "${MAGIC_LINK_TEMPLATE_NAME}"`);
  }

  console.log("Resolving trigger metrics…");
  const magicLinkMetric = await getMetricId("Magic Link Requested");
  const pickResultMetric = await getMetricId("Pick Result");
  if (!magicLinkMetric || !pickResultMetric) {
    console.warn(
      "  ⚠ Metric(s) not found: " +
        [["Magic Link Requested", magicLinkMetric], ["Pick Result", pickResultMetric]]
          .filter(([, v]) => !v).map(([n]) => n).join(", ") +
        ". Trigger the event once from the app so the metric exists, then re-run — skipping those flows.",
    );
  }

  console.log("Creating flows…");
  // 1. Magic Link Sign-In — metric-triggered transactional email with the sign-in link.
  if (magicLinkMetric && templateId) {
    await ensureFlow("Magic Link Sign-In", {
      triggers: [{ type: "metric", id: magicLinkMetric, trigger_filter: null }],
      profile_filter: { condition_groups: [{ conditions: [] }] },
      actions: [{
        temporary_id: "send_email",
        type: "send-email",
        data: {
          message: {
            from_email: FROM_EMAIL,
            from_label: FROM_LABEL,
            reply_to_email: FROM_EMAIL,
            subject_line: "Your Survivor sign-in link",
            preview_text: "Your one-time sign-in link (expires in 15 minutes).",
            template_id: templateId,
            smart_sending_enabled: false,
            transactional: false,
            add_tracking_params: false,
            name: "Magic Link Email",
          },
          status: "live",
        },
        links: { next: null },
      }],
    });
  }

  // 2. Pick Result — metric-triggered push to opted-in profiles when a picked game goes final.
  if (pickResultMetric) {
    await ensureFlow("Pick Result", {
      triggers: [{ type: "metric", id: pickResultMetric, trigger_filter: null }],
      profile_filter: PUSH_ENABLED_FILTER,
      actions: [{
        temporary_id: "push",
        type: "send-webhook",
        data: {
          message: {
            url: PUSH_SEND_URL,
            headers: WEBHOOK_HEADERS,
            body: JSON.stringify({ userId: "{{ event.user_id }}", title: "{{ event.push_title }}", body: "{{ event.push_body }}", url: "{{ event.push_url }}" }),
            name: "Send pick-result push",
          },
          status: "live",
        },
        links: { next: null },
      }],
    });
  }

  // 3. Pick Reminder — date-triggered off each Entry's pick_due; nudges profiles who haven't
  //    locked in. A date-triggered flow MUST begin with a target-date action.
  await ensureFlow("Pick Reminder", {
    triggers: [{
      type: "date",
      date_field_type: "custom-object",
      custom_object_label: "Entry: pick_due",
      custom_object_property_id: 8,
      object_type_id: ENTRY_OBJECT_TYPE_ID,
      object_type_relationship_id: ENTRY_OBJECT_RELATIONSHIP_ID,
      timedelta_unit_before_date: "days",
      timedelta_value_before_date: 0,
      recurrence_frequency: "never",
      timezone: "profile",
      trigger_time: "11:00:00",
      trigger_days: EVERY_DAY,
    }],
    profile_filter: PUSH_ENABLED_FILTER,
    actions: [
      { temporary_id: "target", type: "target-date", data: { timezone: "profile", target_time: "11:00:00", target_days: EVERY_DAY }, links: { next: "push" } },
      {
        temporary_id: "push",
        type: "send-webhook",
        data: {
          message: {
            url: PUSH_SEND_URL,
            headers: WEBHOOK_HEADERS,
            body: JSON.stringify({ email: "{{ person.email }}", title: "Survivor pick reminder", body: "Your pick deadline is coming up and you haven't locked in yet. Tap to pick.", url: "/matchups" }),
            name: "Send pick-reminder push",
          },
          status: "live",
        },
        links: { next: null },
      },
    ],
  });
}

main();
