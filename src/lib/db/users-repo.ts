import { sql } from "./client";

/** Map a Better Auth user's email to their id (emails are unique), or null. */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const rows = (await sql`
    SELECT id FROM "user" WHERE lower(email) = lower(${email}) LIMIT 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}
