import { describe, it, expect } from "vitest";
import { recommend } from "@/lib/pick-engine";
import type { WinProb } from "@/lib/types";

// Juggernaut KC 0.97 both weeks; SF 0.85 this week, 0.55 next.
// Optimal: SF now (0.85) + KC wk2 (0.97) = 0.8245 beats KC now (0.97)+SF wk2 (0.55)=0.5335.
const wps: WinProb[] = [
  { week: 1, team: "KC", opponent: "X", home: true, prob: 0.97, source: "odds" },
  { week: 1, team: "SF", opponent: "Y", home: true, prob: 0.85, source: "odds" },
  { week: 2, team: "KC", opponent: "Z", home: true, prob: 0.97, source: "fpi" },
  { week: 2, team: "SF", opponent: "W", home: true, prob: 0.55, source: "fpi" },
];

describe("recommend", () => {
  it("saves the juggernaut for the future week", () => {
    const rec = recommend("Jon 1", 1, wps, { safetyFloor: 0 });
    expect(rec.pick).toBe("SF");
    const kcPath = rec.projectedPath.find((p) => p.team === "KC");
    expect(kcPath?.week).toBe(2);
  });

  it("greedy alternative is the highest-prob team this week", () => {
    const rec = recommend("Jon 1", 1, wps, { safetyFloor: 0 });
    expect(rec.greedyAlt?.team).toBe("KC");
    expect(rec.greedyAlt?.prob).toBeCloseTo(0.97, 6);
  });

  it("safety floor keeps a sufficiently safe pick", () => {
    const risky: WinProb[] = [
      { week: 1, team: "AAA", opponent: "X", home: true, prob: 0.60, source: "fpi" },
      { week: 1, team: "BBB", opponent: "Y", home: true, prob: 0.80, source: "odds" },
      { week: 2, team: "AAA", opponent: "Z", home: true, prob: 0.90, source: "fpi" },
      { week: 2, team: "BBB", opponent: "W", home: true, prob: 0.50, source: "fpi" },
    ];
    const rec = recommend("Jon 1", 1, risky, { safetyFloor: 0.75 });
    expect(rec.pick).toBe("BBB");
    expect(rec.prob).toBeGreaterThanOrEqual(0.75);
  });

  it("overrides the optimal pick when it is below the floor, without a contradictory 'saving' reason", () => {
    // Optimal path (max total log-prob) assigns AAA to week 1:
    //   log(0.60)+log(0.95) = -0.562  >  log(0.80)+log(0.70) = -0.580
    // But AAA (0.60) is below the 0.75 floor, so the floor must override to BBB (0.80),
    // the very team the optimal path was saving for week 2 — the reasoning must NOT say
    // it is "saving BBB" while picking BBB.
    const wps: WinProb[] = [
      { week: 1, team: "AAA", opponent: "X", home: true, prob: 0.60, source: "fpi" },
      { week: 1, team: "BBB", opponent: "Y", home: true, prob: 0.80, source: "odds" },
      { week: 2, team: "AAA", opponent: "Z", home: true, prob: 0.70, source: "fpi" },
      { week: 2, team: "BBB", opponent: "W", home: true, prob: 0.95, source: "fpi" },
    ];
    const rec = recommend("Jon 1", 1, wps, { safetyFloor: 0.75 });
    expect(rec.pick).toBe("BBB");
    expect(rec.prob).toBeGreaterThanOrEqual(0.75);
    expect(rec.reasoning).not.toContain("saving BBB");
    expect(rec.reasoning.toLowerCase()).toContain("override");
  });

  it("returns a null pick when no teams are available", () => {
    const rec = recommend("Jon 1", 1, [], { safetyFloor: 0 });
    expect(rec.pick).toBeNull();
  });
});
