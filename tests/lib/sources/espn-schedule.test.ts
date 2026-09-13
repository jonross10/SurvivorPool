import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScoreboard } from "@/lib/sources/espn-schedule";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/espn-scoreboard-week1.json"), "utf8"),
);

describe("parseScoreboard", () => {
  it("returns matchups with normalized home/away teams and week", () => {
    const games = parseScoreboard(fixture, 1);
    expect(games.length).toBeGreaterThan(0);
    for (const g of games) {
      expect(g.week).toBe(1);
      expect(g.home).toMatch(/^[A-Z]{2,3}$/);
      expect(g.away).toMatch(/^[A-Z]{2,3}$/);
      expect(typeof g.kickoff).toBe("string");
    }
  });
  it("normalizes ESPN abbreviations (no team dropped)", () => {
    const games = parseScoreboard(fixture, 1);
    // 16 games in week 1 → 16 home + 16 away, all normalized without throwing
    expect(games.length).toBe(16);
  });
});
