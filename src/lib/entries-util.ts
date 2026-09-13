import type { Entry } from "./types";

export class EmptyNameError extends Error {}
export class DuplicateNameError extends Error {}

/** Trim and validate an entry name. Throws EmptyNameError when blank. */
export function validateEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new EmptyNameError("Entry name is required");
  return trimmed;
}

/** Build a display-name → id lookup for the given entries. */
export function nameToId(entries: Entry[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.name, e.id]));
}
