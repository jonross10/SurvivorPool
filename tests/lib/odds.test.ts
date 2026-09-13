import { describe, it, expect } from "vitest";
import { americanToImplied, devigTwoWay } from "@/lib/odds";

describe("americanToImplied", () => {
  it("converts negative (favorite) odds", () => {
    expect(americanToImplied(-200)).toBeCloseTo(0.6667, 4);
  });
  it("converts positive (underdog) odds", () => {
    expect(americanToImplied(+150)).toBeCloseTo(0.4, 4);
  });
});

describe("devigTwoWay", () => {
  it("removes the vig so the two sides sum to 1", () => {
    const { favProb, dogProb } = devigTwoWay(-200, +170);
    expect(favProb + dogProb).toBeCloseTo(1, 6);
    expect(favProb).toBeGreaterThan(dogProb);
  });
  it("favorite prob stays high after de-vig", () => {
    const { favProb } = devigTwoWay(-200, +170);
    expect(favProb).toBeGreaterThan(0.6);
  });
});
