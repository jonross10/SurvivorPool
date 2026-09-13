import { unstable_cache, revalidateTag } from "next/cache";
import { sql } from "./client";
import { validateEntryName, DuplicateNameError } from "../entries-util";
import type { Entry } from "../types";

const TAG = "entries";

async function fetchEntries(): Promise<Entry[]> {
  return (await sql`SELECT id, name FROM entries ORDER BY name`) as unknown as Entry[];
}

/** Cached list of entries; invalidated by createEntry/deleteEntry via revalidateTag. */
export const getEntries = unstable_cache(fetchEntries, ["entries"], { tags: [TAG] });

export async function createEntry(name: string): Promise<Entry> {
  const clean = validateEntryName(name);
  const dup = (await sql`SELECT 1 FROM entries WHERE lower(name) = lower(${clean})`) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  const id = crypto.randomUUID();
  await sql`INSERT INTO entries (id, name) VALUES (${id}, ${clean})`;
  revalidateTag(TAG);
  return { id, name: clean };
}

export async function deleteEntry(id: string): Promise<boolean> {
  await sql`DELETE FROM picks WHERE entry_id = ${id}`;
  const rows = (await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`) as unknown[];
  revalidateTag(TAG);
  return rows.length > 0;
}
