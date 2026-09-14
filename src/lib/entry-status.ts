import { getEntries } from "./db/entries-repo";
import { getPicks } from "./db/picks-repo";
import { getOverrides } from "./db/pick-overrides-repo";
import { deriveEntryStatus, type EntryStatus } from "./elimination";
import type { Entry, GameResult, TeamAbbr } from "./types";

export interface EntryWithStatus {
  entry: Entry;
  picksByWeek: Record<number, TeamAbbr>;
  status: EntryStatus;
}

/** Load every entry with its picks and derived elimination status. */
export async function getEntryStatuses(results: GameResult[]): Promise<EntryWithStatus[]> {
  const entries = await getEntries();
  const out: EntryWithStatus[] = [];
  for (const e of entries) {
    const picks = await getPicks(e.id);
    const picksByWeek = Object.fromEntries(picks.map((p) => [p.week, p.team]));
    const overrides = await getOverrides(e.id);
    const tiesSurvive = e.settings.ties_survive ?? true;
    const status = deriveEntryStatus(picksByWeek, results, overrides, tiesSurvive);
    out.push({ entry: e, picksByWeek, status });
  }
  return out;
}
