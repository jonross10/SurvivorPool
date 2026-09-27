import type { Entry, EntrySettings } from "./types";

export class EmptyNameError extends Error {}
export class DuplicateNameError extends Error {}

/**
 * Coerce a raw settings object (e.g. from agent tool templates, where every value
 * arrives as a string) into a typed EntrySettings, dropping blank/absent keys so
 * they aren't stored as empty values. Only recognized keys are kept.
 */
export function normalizeSettings(raw: Record<string, unknown>): EntrySettings {
  const out: EntrySettings = {};
  // Blank = absent, or an empty/whitespace string, or an unrendered template
  // token (e.g. "{{pool}}" when an optional agent variable wasn't supplied).
  const blank = (v: unknown) =>
    v === undefined || v === null ||
    (typeof v === "string" && (v.trim() === "" || v.includes("{{")));

  if (!blank(raw.ties_survive)) {
    const v = raw.ties_survive;
    out.ties_survive = typeof v === "string" ? v.trim().toLowerCase() === "true" : (v as boolean);
  }
  if (!blank(raw.pool)) {
    out.pool = typeof raw.pool === "string" ? raw.pool.trim() : (raw.pool as string);
  }
  if (!blank(raw.min_win_chance)) {
    out.min_win_chance = typeof raw.min_win_chance === "string" ? Number(raw.min_win_chance) : (raw.min_win_chance as number);
  }
  if ("pick_due" in raw && raw.pick_due !== undefined) {
    out.pick_due = raw.pick_due as EntrySettings["pick_due"];
  }
  return out;
}

/** Validate typed settings. Returns an error detail string, or null when valid. */
export function validateSettings(settings: EntrySettings): string | null {
  if ("ties_survive" in settings && typeof settings.ties_survive !== "boolean") {
    return "ties_survive must be a boolean";
  }
  if ("pool" in settings && (typeof settings.pool !== "string" || settings.pool.trim() === "")) {
    return "pool must be a non-empty string";
  }
  if ("min_win_chance" in settings &&
      (typeof settings.min_win_chance !== "number" || Number.isNaN(settings.min_win_chance) ||
       settings.min_win_chance < 0 || settings.min_win_chance > 0.95)) {
    return "min_win_chance must be a number between 0 and 0.95";
  }
  if ("pick_due" in settings && settings.pick_due !== null && settings.pick_due !== undefined) {
    const pd = settings.pick_due;
    const validDay = typeof pd?.day === "number" && Number.isInteger(pd.day) && pd.day >= 0 && pd.day <= 6;
    const validTime = typeof pd?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(pd.time);
    if (!validDay || !validTime) return "pick_due must be { day: 0-6, time: 'HH:MM' } or null";
  }
  return null;
}

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
