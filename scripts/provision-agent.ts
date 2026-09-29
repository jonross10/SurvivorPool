/**
 * One-time Klaviyo Customer Agent provisioning.
 * Run: KLAVIYO_API_KEY=... API_KEY=... APP_BASE_URL=https://survivor-pool-ebon.vercel.app npx tsx scripts/provision-agent.ts
 * Re-runnable: resources that 409 (already exist) are skipped.
 *
 * Auth model: every tool authenticates to our app with the shared API key (sent as
 * the X-API-Key header from an encrypted agent-secret) and names the acting user by
 * appending `?email={{email}}` — the email is injected from the conversation's
 * Klaviyo profile. Our /api maps that email to the user and scopes the request.
 */
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2026-07-15.pre";
const APP = process.env.APP_BASE_URL;
const KEY = process.env.KLAVIYO_API_KEY;
const API_KEY = process.env.API_KEY;
if (!KEY || !APP || !API_KEY) {
  console.error("Set KLAVIYO_API_KEY, API_KEY, and APP_BASE_URL");
  process.exit(1);
}

function klaviyoHeaders(): Record<string, string> {
  return {
    Authorization: `Klaviyo-API-Key ${KEY}`,
    revision: REVISION,
    accept: "application/vnd.api+json",
    "content-type": "application/vnd.api+json",
  };
}

async function post(path: string, data: unknown): Promise<{ id?: string; status: number }> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: klaviyoHeaders(), body: JSON.stringify({ data }) });
  if (res.status === 409) { console.log(`  (exists) ${path}`); return { status: 409 }; }
  if (!res.ok) { console.error(`  FAILED ${path}: ${res.status} ${await res.text()}`); process.exit(1); }
  const doc = await res.json();
  return { id: doc.data?.id, status: res.status };
}

async function getFirstIdByName(path: string, name: string): Promise<string | undefined> {
  const res = await fetch(`${BASE}${path}`, { headers: klaviyoHeaders() });
  if (!res.ok) return undefined;
  const doc = await res.json();
  return (doc.data ?? []).find((d: { attributes?: { name?: string } }) => d.attributes?.name === name)?.id;
}

// --- Shared auth wiring for every tool -------------------------------------------
const SECRET_NAME = "Survivor App API Key";
const API_KEY_HEADER = { name: "X-API-Key", value: "{{apiKey}}" };

// The email is injected from the conversation's Klaviyo profile.
// VERIFY: `value` is the Klaviyo-provided reference id for the profile's email under
// source "klaviyo". The UI labels it "Klaviyo Profile → Email"; if provisioning 400s
// on this variable, check the exact reference id (e.g. "profile.email") and update here.
const EMAIL_VAR = {
  name: "email",
  type: "string",
  required: true,
  description: "The signed-in user's email, from the conversation's Klaviyo profile.",
  source: "klaviyo",
  value: "email",
};

function apiKeyVar(secretId: string) {
  return { name: "apiKey", type: "string", required: true, description: "Survivor app API key.", source: "secret", value: secretId };
}

/** Append the acting user's email as a query param, respecting existing query strings. */
function withEmail(url: string): string {
  return url.includes("?") ? `${url}&email={{email}}` : `${url}?email={{email}}`;
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
    url_template: withEmail(def.url),
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
        variables: [...(def.variables ?? []), EMAIL_VAR, apiKeyVar(secretId)],
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
  ].filter(Boolean).map((id) => ({ type: "agent-tool", id }));
  await post("/agent-skills", {
    type: "agent-skill",
    attributes: {
      display_name: "Survivor Strategy",
      description: "Answers NFL survivor pool strategy questions, recommends and makes picks. Use for anything about entries, picks, matchups, odds, or the season plan.",
      instructions:
        "You are a sharp NFL survivor-pool strategist for this app. Always ground answers in live data: " +
        "call get_entries and get_matchups (and use the projection) before giving numbers — never guess.\n\n" +
        "CURRENT WEEK: get_entries returns meta.currentWeek — that integer is THE current NFL week. When the user " +
        "says \"this week\" or \"now\", they mean meta.currentWeek. Do NOT advance to a later week on your own. If an " +
        "entry has already locked a pick for the current week (currentPick is set), say so plainly — e.g. \"Archie " +
        "already has KC locked in for Week 3\" — and only discuss a future week if the user explicitly asks about one.\n\n" +
        "ENTRY MANAGEMENT: you can create_entry (by name), update_entry (rename), and delete_entry. update_entry and " +
        "delete_entry need the entry id — resolve it from get_entries first. Confirm before create/rename, and " +
        "ALWAYS confirm the exact entry name before delete_entry (it is destructive and removes the entry's picks).\n\n" +
        "Explain trade-offs (safety vs saving strong teams for later, diversification across the pool). You may record " +
        "a pick with make_pick, but ONLY after stating the exact entry, week, and team and getting the user's explicit " +
        "'yes' in this chat. Be concise. Use markdown (bold, bullet lists, tables) to format answers clearly.",
      status: "draft",
      handoff: "none",
    },
    relationships: toolIds.length ? { "agent-tools": { data: toolIds } } : undefined,
  });

  console.log("Done. Review the skill in Klaviyo and set status=live when ready.");
}
main();
