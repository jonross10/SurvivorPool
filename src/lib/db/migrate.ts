import { readFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { resolveDatabaseUrl } from "./client";

async function main() {
  const sql = neon(resolveDatabaseUrl());
  const raw = readFileSync(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
  // Strip `--` line comments first: neon() splits on ';', and a semicolon inside a
  // comment would otherwise break a statement in two. (No string literals contain
  // `--` in this schema, so a line-based strip is safe.)
  const ddl = raw.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
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
