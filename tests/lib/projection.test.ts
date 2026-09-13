import { describe, it, expect } from "vitest";
import { projectWinProb } from "@/lib/projection";

describe("projectWinProb", () => {
  it("makes the two sides of a matchup complementary (sum to 1)", () => {
    const home = projectWinProb(3, 0, true);
    const away = projectWinProb(0, 3, false);
    expect(home + away).toBeCloseTo(1, 6);
  });
  it("favors the home team for evenly-matched opponents", () => {
    expect(projectWinProb(0, 0, true)).toBeGreaterThan(0.5);
    expect(projectWinProb(0, 0, false)).toBeLessThan(0.5);
  });
  it("favors the stronger team", () => {
    expect(projectWinProb(10, 0, false)).toBeGreaterThan(0.5);
    expect(projectWinProb(0, 10, false)).toBeLessThan(0.5);
  });
  it("home field increases win prob", () => {
    const away = projectWinProb(5, 0, false);
    const home = projectWinProb(5, 0, true);
    expect(home).toBeGreaterThan(away);
  });
  it("is bounded in (0,1)", () => {
    expect(projectWinProb(100, 0, true)).toBeLessThan(1);
    expect(projectWinProb(-100, 0, false)).toBeGreaterThan(0);
  });
});
