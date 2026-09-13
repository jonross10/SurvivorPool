import { describe, it, expect } from "vitest";
import { projectWinProb } from "@/lib/projection";

describe("projectWinProb", () => {
  it("gives 0.5 for equal teams on a neutral field", () => {
    expect(projectWinProb(0, 0, false)).toBeCloseTo(0.5, 6);
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
