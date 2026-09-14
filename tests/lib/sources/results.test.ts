import { describe, it, expect } from "vitest";
import { mergeResults, shouldRefetch } from "@/lib/sources/results";
import type { GameResult } from "@/lib/types";

function g(over: Partial<GameResult>): GameResult {
  return { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-13T17:00:00Z",
    homeScore: null, awayScore: null, winner: null, completed: false,
    inProgress: false, statusDetail: "", ...over };
}

describe("mergeResults", () => {
  it("replaces prior games by (week, home, away) and keeps others", () => {
    const prior = [g({ week: 1, statusDetail: "old" }), g({ week: 2, home: "KC", away: "DET" })];
    const fresh = [g({ week: 1, statusDetail: "new", completed: true })];
    const merged = mergeResults(prior, fresh);
    expect(merged).toHaveLength(2);
    const wk1 = merged.find((r) => r.week === 1)!;
    expect(wk1.statusDetail).toBe("new");
    expect(wk1.completed).toBe(true);
    expect(merged.some((r) => r.week === 2)).toBe(true);
  });
});

describe("shouldRefetch", () => {
  const now = new Date("2026-09-13T18:00:00Z");
  it("refetches when the week is missing", () => {
    expect(shouldRefetch([], 1, "2026-09-13T17:59:50Z", now)).toBe(true);
  });
  it("never refetches when every game that week is final", () => {
    expect(shouldRefetch([g({ week: 1, completed: true })], 1, "2026-09-13T17:00:00Z", now)).toBe(false);
  });
  it("refetches a non-final week older than 60s", () => {
    expect(shouldRefetch([g({ week: 1, inProgress: true })], 1, "2026-09-13T17:58:00Z", now)).toBe(true);
  });
  it("does not refetch a non-final week fetched within 60s", () => {
    expect(shouldRefetch([g({ week: 1, inProgress: true })], 1, "2026-09-13T17:59:30Z", now)).toBe(false);
  });
});
