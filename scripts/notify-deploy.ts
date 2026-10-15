/**
 * Push a "shipped" notification to the maintainer's phone after a push to master.
 *
 * Run AFTER a successful push:
 *   npx tsx scripts/notify-deploy.ts            # summarizes the latest commit
 *   npx tsx scripts/notify-deploy.ts A..B       # summarizes a commit range (what you just pushed)
 *
 * Reads API_KEY, NOTIFY_USER_ID, and APP_BASE_URL from the environment or .env.local.
 * It's the deploy-notification half of the app-improvements workflow (see
 * docs/app-improvements-runner.md); harmless to run by hand.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Read a key from process.env, falling back to a simple .env.local parse. */
function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  try {
    const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const APP = env("APP_BASE_URL") ?? "https://survivor-pool-ebon.vercel.app";
const API_KEY = env("API_KEY");
const USER_ID = env("NOTIFY_USER_ID");
if (!API_KEY || !USER_ID) {
  console.error("Set API_KEY and NOTIFY_USER_ID (env or .env.local).");
  process.exit(1);
}

const range = process.argv[2];
const logCmd = range ? `git log ${range} --no-merges --format=%s` : "git log -1 --no-merges --format=%s";
const subjects = execSync(logCmd, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
if (subjects.length === 0) {
  console.log("No commits to notify about.");
  process.exit(0);
}

const title = subjects.length === 1 ? "🚀 Shipped" : `🚀 Shipped ${subjects.length} changes`;
const body = subjects.map((s) => `• ${s}`).join("\n").slice(0, 400);

const res = await fetch(`${APP}/api/push/send`, {
  method: "POST",
  headers: { "content-type": "application/json", "X-API-Key": API_KEY },
  body: JSON.stringify({ userId: USER_ID, title, body, url: "/" }),
});
console.log(`push ${res.status}:`, (await res.text()).slice(0, 200));
