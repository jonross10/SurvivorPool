import { describe, it, expect } from "vitest";
import { buildRecommendations } from "@/lib/recommendations";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "NYJ", fpi: -3 },
  { team: "KC", fpi: 8 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [];

describe("buildRecommendations", () => {
  it("produces one recommendation per entry, excluding used teams", () => {
    const recs = buildRecommendations(
      schedule, strengths, odds,
      { "Jon 1": new Set(["KC"]), "Jon 2": new Set() },
      new Date("2026-09-09T00:00:00Z"),
      0.6,
    );
    expect(recs.length).toBe(2);
    const jon1 = recs.find((r) => r.entry === "Jon 1")!;
    expect(jon1.projectedPath.every((p) => p.team !== "KC")).toBe(true);
    expect(jon1.week).toBe(1);
  });
});
