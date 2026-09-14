import { describe, it, expect } from "vitest";
import { currentWeek, currentSeason } from "@/lib/week";
import type { Matchup } from "@/lib/types";

describe("currentSeason", () => {
  it("maps August through December to that calendar year", () => {
    expect(currentSeason(new Date("2026-08-01T00:00:00Z"))).toBe(2026);
    expect(currentSeason(new Date("2026-09-14T00:00:00Z"))).toBe(2026);
    expect(currentSeason(new Date("2026-12-31T23:59:59Z"))).toBe(2026);
  });
  it("maps January through July to the previous calendar year", () => {
    expect(currentSeason(new Date("2027-01-01T00:00:00Z"))).toBe(2026);
    expect(currentSeason(new Date("2027-02-15T00:00:00Z"))).toBe(2026); // Super Bowl month
    expect(currentSeason(new Date("2027-07-31T23:59:59Z"))).toBe(2026);
  });
  it("rolls over to the next season on August 1", () => {
    expect(currentSeason(new Date("2027-07-31T23:59:59Z"))).toBe(2026);
    expect(currentSeason(new Date("2027-08-01T00:00:00Z"))).toBe(2027);
  });
});

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
