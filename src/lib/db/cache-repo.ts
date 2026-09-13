import { sql } from "./client";

export async function setCache(key: string, payload: unknown): Promise<void> {
  await sql`
    INSERT INTO cache (key, payload, fetched_at)
    VALUES (${key}, ${JSON.stringify(payload)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()
  `;
}

export async function getCache<T>(key: string): Promise<{ payload: T; fetchedAt: string } | null> {
  const rows = (await sql`SELECT payload, fetched_at FROM cache WHERE key = ${key}`) as any[];
  if (rows.length === 0) return null;
  return { payload: rows[0].payload as T, fetchedAt: rows[0].fetched_at };
}
