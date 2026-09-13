import { neon } from "@neondatabase/serverless";

type Sql = ReturnType<typeof neon>;

// Lazily construct the Neon client on first use. Constructing at import time
// (and throwing when DATABASE_URL is unset) would break importing this module's
// consumers in contexts without a database — e.g. unit-testing the pure helpers
// in picks-repo.ts, or `next build` evaluating a route module. The connection is
// only needed when a query actually runs.
let client: Sql | null = null;

function getSql(): Sql {
  if (!client) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    client = neon(process.env.DATABASE_URL);
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
