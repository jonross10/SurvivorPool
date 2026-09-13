import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFpi } from "@/lib/sources/espn-fpi";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/espn-fpi.json"), "utf8"),
);

describe("parseFpi", () => {
  it("returns one strength per team with numeric fpi", () => {
    const strengths = parseFpi(fixture);
    expect(strengths.length).toBe(32);
    for (const s of strengths) {
      expect(s.team).toMatch(/^[A-Z]{2,3}$/);
      expect(Number.isFinite(s.fpi)).toBe(true);
    }
  });
  it("spreads teams across a realistic FPI range", () => {
    const strengths = parseFpi(fixture);
    const vals = strengths.map((s) => s.fpi);
    expect(Math.max(...vals)).toBeGreaterThan(3);   // a strong team
    expect(Math.min(...vals)).toBeLessThan(-3);     // a weak team
  });
});
