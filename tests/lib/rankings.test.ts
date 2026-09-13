import { describe, it, expect } from "vitest";
import { computeRanks } from "@/lib/rankings";
import type { TeamStrength } from "@/lib/types";

describe("computeRanks", () => {
  it("ranks the highest FPI as #1", () => {
    const strengths: TeamStrength[] = [
      { team: "BUF", fpi: 6 },
      { team: "KC", fpi: 9 },
      { team: "NYJ", fpi: -3 },
    ];
    const ranks = computeRanks(strengths);
    expect(ranks.KC).toBe(1);
    expect(ranks.BUF).toBe(2);
    expect(ranks.NYJ).toBe(3);
  });
  it("handles an empty list", () => {
    expect(computeRanks([])).toEqual({});
  });
});
