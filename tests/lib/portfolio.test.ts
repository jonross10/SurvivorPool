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
