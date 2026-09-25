import { describe, it, expect } from "vitest";
import { buildRecommendations } from "@/lib/recommendations";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "KC", away: "BUF", kickoff: "2026-09-17T00:00:00Z" },
  { week: 2, home: "DET", away: "NYJ", kickoff: "2026-09-17T00:00:00Z" },
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "NYJ", fpi: -3 },
  { team: "KC", fpi: 8 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [];

describe("buildRecommendations", () => {
  it("produces one recommendation per entry, excluding already-picked (used) teams", () => {
    const recs = buildRecommendations(
      schedule, strengths, odds,
      [
        // Jon 1 already used KC in week 1, so it must not appear in their future plan.
        { name: "Jon 1", pool: "main", picksByWeek: { 1: "KC" }, safetyFloor: 0.6 },
        { name: "Jon 2", pool: "main", picksByWeek: {}, safetyFloor: 0.6 },
      ],
      new Date("2026-09-09T00:00:00Z"),
    );
    expect(recs.length).toBe(2);
    const jon1 = recs.find((r) => r.entry === "Jon 1")!;
    expect(jon1.week).toBe(1);
    expect(jon1.projectedPath.every((p) => p.team !== "KC")).toBe(true);
  });

  it("diversifies current-week picks across entries in the same pool", () => {
    const recs = buildRecommendations(
      schedule, strengths, odds,
      [
        { name: "A", pool: "main", picksByWeek: {}, safetyFloor: 0 },
        { name: "B", pool: "main", picksByWeek: {}, safetyFloor: 0 },
      ],
      new Date("2026-09-09T00:00:00Z"),
    );
    const a = recs.find((r) => r.entry === "A")!;
    const b = recs.find((r) => r.entry === "B")!;
    expect(a.pick).not.toBe(b.pick); // distinct current-week picks
  });
});
