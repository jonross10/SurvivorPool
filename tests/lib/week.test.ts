import { describe, it, expect } from "vitest";
import { currentWeek } from "@/lib/week";
import type { Matchup } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "KC", away: "DET", kickoff: "2026-09-17T00:00:00Z" },
];

describe("currentWeek", () => {
  it("returns the week whose games are still upcoming", () => {
    expect(currentWeek(schedule, new Date("2026-09-09T00:00:00Z"))).toBe(1);
    expect(currentWeek(schedule, new Date("2026-09-12T00:00:00Z"))).toBe(2);
  });
  it("returns the last week + 1 when the season is over", () => {
    expect(currentWeek(schedule, new Date("2027-01-01T00:00:00Z"))).toBe(3);
  });
});
