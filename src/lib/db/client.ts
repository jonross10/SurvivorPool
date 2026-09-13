import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

/**
 * Resolve the Neon connection string. Prefers NEON_DB_CONNECTION_URL (the name
 * used in this project's environment) and falls back to DATABASE_URL for
 * compatibility with the usual Vercel/Neon convention.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.NEON_DB_CONNECTION_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("NEON_DB_CONNECTION_URL (or DATABASE_URL) is not set");
  }
  return url;
}

// Lazily construct the Neon client on first use. Constructing at import time
// (and throwing when the URL is unset) would break importing this module's
// consumers in contexts without a database — e.g. unit-testing the pure helpers
// in picks-repo.ts, or `next build` evaluating a route module. The connection is
// only needed when a query actually runs.
let client: Sql | null = null;

function getSql(): Sql {
  if (!client) {
    client = neon(resolveDatabaseUrl());
  }
  return client;
}

// A transparent proxy so callers keep using it as a tagged template
// (`sql`...``) and via methods (`sql.query(...)`), while initialization is
// deferred until the first call rather than at import time.
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const s = getSql() as unknown as Record<string | symbol, unknown>;
    const value = s[prop];
    return typeof value === "function" ? value.bind(s) : value;
  },
});
