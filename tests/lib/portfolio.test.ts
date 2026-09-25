import { describe, it, expect } from "vitest";
import { planEntryPath } from "@/lib/portfolio";
import type { WinProb } from "@/lib/types";

function wp(week: number, team: string, prob: number): WinProb {
  return { week, team, opponent: "OPP", home: true, prob, source: "fpi" };
}

// Two weeks, teams A (strong both weeks) and B (weak).
const probs: WinProb[] = [
  wp(1, "A", 0.9), wp(1, "B", 0.6),
  wp(2, "A", 0.9), wp(2, "B", 0.5),
];

describe("planEntryPath", () => {
  it("assigns one distinct team per week maximizing the product", () => {
    const path = planEntryPath(probs, new Set(), new Set());
    expect(path.map((p) => p.week)).toEqual([1, 2]);
    expect(new Set(path.map((p) => p.team)).size).toBe(2); // no repeats
  });

  it("skips locked weeks (they are already decided)", () => {
    const path = planEntryPath(probs, new Set(), new Set([1]));
    expect(path.map((p) => p.week)).toEqual([2]);
  });

  it("honors forbidden (week:team) cells", () => {
    const path = planEntryPath(probs, new Set(["1:A"]), new Set());
    const w1 = path.find((p) => p.week === 1)!;
    expect(w1.team).toBe("B"); // A forbidden in week 1
  });
});

import { planPortfolio } from "@/lib/portfolio";

describe("planPortfolio", () => {
  // Both entries would independently want A in week 1 (0.9). They must diverge.
  const base = [
    wp(1, "A", 0.9), wp(1, "B", 0.6),
    wp(2, "A", 0.9), wp(2, "B", 0.5),
  ];

  it("de-collides: two entries end up on different teams in a week", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: base, lockedByWeek: {} },
      { entry: "Y", winProbs: base, lockedByWeek: {} },
    ]);
    const x1 = plans.find((p) => p.entry === "X")!.path.find((p) => p.week === 1)!;
    const y1 = plans.find((p) => p.entry === "Y")!.path.find((p) => p.week === 1)!;
    expect(x1.team).not.toBe(y1.team);
  });

  it("a locked pick wins the collision; the other entry re-plans around it", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: base, lockedByWeek: { 1: "A" } }, // X already took A in W1
      { entry: "Y", winProbs: base, lockedByWeek: {} },
    ]);
    const y1 = plans.find((p) => p.entry === "Y")!.path.find((p) => p.week === 1)!;
    expect(y1.team).toBe("B"); // Y bumped off A
  });

  it("independent entries (no shared teams) keep their optimal picks", () => {
    const plans = planPortfolio([
      { entry: "X", winProbs: [wp(1, "A", 0.9)], lockedByWeek: {} },
      { entry: "Y", winProbs: [wp(1, "C", 0.8)], lockedByWeek: {} },
    ]);
    expect(plans.find((p) => p.entry === "X")!.path[0].team).toBe("A");
    expect(plans.find((p) => p.entry === "Y")!.path[0].team).toBe("C");
  });
});

import { survivalCurve } from "@/lib/portfolio";

describe("survivalCurve", () => {
  it("P(>=1 alive) combines entries as 1 - product of each entry's failure prob", () => {
    // Two entries, each 50% to win week 1.
    const plans = [
      { entry: "X", path: [{ week: 1, team: "A", prob: 0.5 }] },
      { entry: "Y", path: [{ week: 1, team: "B", prob: 0.5 }] },
    ];
    const curve = survivalCurve(plans, [1]);
    // each survives W1 with 0.5; P(>=1) = 1 - 0.5*0.5 = 0.75
    expect(curve[0].week).toBe(1);
    expect(curve[0].prob).toBeCloseTo(0.75, 6);
  });

  it("compounds across weeks for a single entry", () => {
    const plans = [{ entry: "X", path: [{ week: 1, team: "A", prob: 0.8 }, { week: 2, team: "B", prob: 0.5 }] }];
    const curve = survivalCurve(plans, [2]);
    expect(curve[0].prob).toBeCloseTo(0.4, 6); // 0.8 * 0.5
  });
});
