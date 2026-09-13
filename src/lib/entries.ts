export interface Entry {
  id: string;
  name: string;
}

// Single source of truth for the pool entries. To add / rename / remove an
// entry, edit this list AND the seed in src/lib/db/schema.sql — the API routes
// and UI all derive from here, so nothing else needs to change.
export const ENTRIES: Entry[] = [
  { id: "jon", name: "Jon" },
  { id: "genevieve", name: "Genevieve" },
  { id: "elliot", name: "Elliot" },
];

export const ENTRY_NAMES: string[] = ENTRIES.map((e) => e.name);

export const NAME_TO_ID: Record<string, string> = Object.fromEntries(
  ENTRIES.map((e) => [e.name, e.id]),
);
