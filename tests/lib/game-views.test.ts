import { describe, it, expect } from "vitest";
import { buildGameViews } from "@/lib/game-views";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "BUF", away: "KC", kickoff: "2026-09-17T00:00:00Z" },
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "NYJ", fpi: -2 },
  { team: "KC", fpi: 8 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [
  { week: 1, home: "BUF", away: "NYJ", homeOdds: -300, awayOdds: 250 },
];

describe("buildGameViews", () => {
  it("uses de-vigged odds when a line is posted", () => {
    const gv = buildGameViews(schedule, strengths, odds, 1);
    const buf = gv.find((g) => g.home === "BUF")!;
    expect(buf.source).toBe("odds");
    expect(buf.homeOdds).toBe(-300);
    expect(buf.awayOdds).toBe(250);
    expect(buf.homeProb).toBeGreaterThan(buf.awayProb);
    expect(buf.homeProb + buf.awayProb).toBeCloseTo(1, 6);
  });
  it("falls back to FPI (null odds, complementary probs) when unposted", () => {
    const gv = buildGameViews(schedule, strengths, odds, 1);
    const kc = gv.find((g) => g.home === "KC")!;
    expect(kc.source).toBe("fpi");
    expect(kc.homeOdds).toBeNull();
    expect(kc.homeProb + kc.awayProb).toBeCloseTo(1, 6);
  });
  it("only returns the requested week", () => {
    const gv = buildGameViews(schedule, strengths, odds, 2);
    expect(gv.length).toBe(1);
    expect(gv[0].week).toBe(2);
  });
});
