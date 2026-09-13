import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { resolveDatabaseUrl } from "./client";

async function main() {
  const sql = neon(resolveDatabaseUrl());
  const ddl = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  // neon() cannot run multiple statements in one call; split on ';'.
  for (const stmt of ddl.split(";").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  console.log("Migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
