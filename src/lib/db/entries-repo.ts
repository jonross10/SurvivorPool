import { sql } from "./client";
import { validateEntryName, DuplicateNameError } from "../entries-util";
import { newId } from "../ids";
import type { Entry, EntrySettings } from "../types";

/** All entries owned by a user, name-ordered. */
export async function getEntries(ownerId: string): Promise<Entry[]> {
  return (await sql`
    SELECT id, name, settings, owner_id AS "ownerId"
    FROM entries WHERE owner_id = ${ownerId} ORDER BY name
  `) as unknown as Entry[];
}

/** The owner of a single entry, or null if it doesn't exist. For authorization checks. */
export async function getEntryOwner(id: string): Promise<string | null> {
  const rows = (await sql`
    SELECT owner_id AS "ownerId" FROM entries WHERE id = ${id}
  `) as { ownerId: string | null }[];
  return rows[0]?.ownerId ?? null;
}

export async function createEntry(
  ownerId: string,
  name: string,
  settings: EntrySettings = {},
): Promise<Entry> {
  const clean = validateEntryName(name);
  // Names are unique per owner (two users may each have an "Archie").
  const dup = (await sql`
    SELECT 1 FROM entries WHERE owner_id = ${ownerId} AND lower(name) = lower(${clean})
  `) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  const id = newId();
  await sql`
    INSERT INTO entries (id, name, settings, owner_id)
    VALUES (${id}, ${clean}, ${JSON.stringify(settings)}::jsonb, ${ownerId})
  `;
  return { id, name: clean, settings, ownerId };
}

export async function deleteEntry(id: string): Promise<boolean> {
  await sql`DELETE FROM picks WHERE entry_id = ${id}`;
  const rows = (await sql`DELETE FROM entries WHERE id = ${id} RETURNING id`) as unknown[];
  return rows.length > 0;
}

export async function renameEntry(id: string, ownerId: string, name: string): Promise<void> {
  const clean = validateEntryName(name);
  // Reject a name already taken by a *different* entry of the same owner.
  const dup = (await sql`
    SELECT 1 FROM entries
    WHERE owner_id = ${ownerId} AND lower(name) = lower(${clean}) AND id <> ${id}
  `) as unknown[];
  if (dup.length > 0) throw new DuplicateNameError(`An entry named "${clean}" already exists`);
  await sql`UPDATE entries SET name = ${clean} WHERE id = ${id}`;
}

export async function updateSettings(id: string, settings: EntrySettings): Promise<void> {
  await sql`UPDATE entries SET settings = ${JSON.stringify(settings)}::jsonb WHERE id = ${id}`;
}
