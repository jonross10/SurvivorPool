/**
 * One-time Klaviyo Customer Agent provisioning.
 * Run: KLAVIYO_API_KEY=... APP_BASE_URL=https://survivor-pool-ebon.vercel.app npx tsx scripts/provision-agent.ts
 * Re-runnable: resources that 409 (already exist) are skipped.
 */
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2026-07-15.pre";
const APP = process.env.APP_BASE_URL;
const KEY = process.env.KLAVIYO_API_KEY;
if (!KEY || !APP) { console.error("Set KLAVIYO_API_KEY and APP_BASE_URL"); process.exit(1); }

async function post(path: string, data: unknown): Promise<{ id?: string; status: number }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${KEY}`,
      revision: REVISION,
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
    body: JSON.stringify({ data }),
  });
  if (res.status === 409) { console.log(`  (exists) ${path}`); return { status: 409 }; }
  if (!res.ok) { console.error(`  FAILED ${path}: ${res.status} ${await res.text()}`); process.exit(1); }
  const doc = await res.json();
  return { id: doc.data?.id, status: res.status };
}

function httpTool(name: string, description: string, method: string, urlTemplate: string, variables: unknown[] = []) {
  return {
    type: "agent-tool",
    attributes: {
      name,
      public_description: description,
      details: {
        type: "custom",
        protocol: "https",
        request_template: { url_template: urlTemplate, http_method: method, request_timeout_seconds: 10 },
        variables,
        timeout_seconds: 10,
        max_retries: 1,
      },
    },
  };
}

async function main() {
  console.log("Creating tools…");
  const getEntries = await post("/agent-tools", httpTool(
    "get_entries", "Get every entry's status, current pick, used teams, and season projection.",
    "GET", `${APP}/api/recommendations`,
  ));
  const getMatchups = await post("/agent-tools", httpTool(
    "get_matchups", "Get a week's games with odds, spreads, win %, and results.",
    "GET", `${APP}/api/matchups?filter[week]={{week}}`,
    [{ name: "week", type: "number", required: true, description: "NFL week number", source: "dynamic" }],
  ));
  // make_pick: POST body via template. No auth header today (site is public).
  // TO LOCK DOWN LATER: set AGENT_WRITE_TOKEN on the app, create a Klaviyo agent-secret
  // holding that token, and add an `Authorization: Bearer {{token}}` header here with a
  // variable {name:"token", source:"secret", value:"<agent-secret id>"}.
  const makePick = await post("/agent-tools", {
    type: "agent-tool",
    attributes: {
      name: "make_pick",
      public_description: "Record or swap a pick for an entry in a given week. Confirm with the user first.",
      details: {
        type: "custom",
        protocol: "https",
        request_template: {
          url_template: `${APP}/api/picks`,
          http_method: "POST",
          request_timeout_seconds: 10,
          headers: [{ name: "content-type", value: "application/vnd.api+json" }],
          body_template: { data: { type: "pick", attributes: { entry: "{{entry}}", week: "{{week}}", team: "{{team}}" } } },
        },
        variables: [
          { name: "entry", type: "string", required: true, description: "Entry name", source: "dynamic" },
          { name: "week", type: "number", required: true, description: "NFL week", source: "dynamic" },
          { name: "team", type: "string", required: true, description: "Team abbreviation, e.g. KC", source: "dynamic" },
        ],
        timeout_seconds: 10,
        max_retries: 0,
      },
    },
  });

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
  const toolIds = [getEntries.id, getMatchups.id, makePick.id].filter(Boolean).map((id) => ({ type: "agent-tool", id }));
  await post("/agent-skills", {
    type: "agent-skill",
    attributes: {
      display_name: "Survivor Strategy",
      description: "Answers NFL survivor pool strategy questions, recommends and makes picks. Use for anything about entries, picks, matchups, odds, or the season plan.",
      instructions:
        "You are a sharp NFL survivor-pool strategist for this app. Always ground answers in live data: call get_entries and get_matchups (and use the projection) before giving numbers — never guess. Explain trade-offs (safety vs saving strong teams for later, diversification across the pool). You may record a pick with make_pick, but ONLY after stating the exact entry, week, and team and getting the user's explicit 'yes' in this chat. Be concise.",
      status: "draft",
      handoff: "none",
    },
    relationships: toolIds.length ? { "agent-tools": { data: toolIds } } : undefined,
  });

  console.log("Done. Review the skill in Klaviyo and set status=live when ready.");
}
main();
