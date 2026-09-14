import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScoreboard, parseResults } from "@/lib/sources/espn-schedule";

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

describe("parseResults", () => {
  it("extracts scores, winner, and completion from a final game", () => {
    const results = parseResults(fixture, 1);
    expect(results.length).toBeGreaterThan(0);
    const g = results[0];
    expect(g.week).toBe(1);
    expect(g.completed).toBe(true);
    expect(g.inProgress).toBe(false);
    expect(typeof g.homeScore).toBe("number");
    expect(typeof g.awayScore).toBe("number");
    expect([g.home, g.away]).toContain(g.winner);
    expect(g.statusDetail).toBe("Final");
  });

  it("treats an unstarted game as pending (null scores, null winner)", () => {
    const data = { events: [{ date: "2026-09-13T17:00:00Z", competitions: [{
      status: { type: { state: "pre", completed: false, shortDetail: "Sun 1:00 PM" } },
      competitors: [
        { homeAway: "home" as const, team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
        { homeAway: "away" as const, team: { abbreviation: "NYJ", displayName: "New York Jets" } },
      ] }] }] };
    const [g] = parseResults(data, 1);
    expect(g.completed).toBe(false);
    expect(g.inProgress).toBe(false);
    expect(g.homeScore).toBeNull();
    expect(g.awayScore).toBeNull();
    expect(g.winner).toBeNull();
  });

  it("marks an in-progress game and keeps live scores", () => {
    const data = { events: [{ date: "2026-09-13T17:00:00Z", competitions: [{
      status: { type: { state: "in", completed: false, shortDetail: "Q3 5:22" } },
      competitors: [
        { homeAway: "home" as const, winner: false, score: 14, team: { abbreviation: "BUF", displayName: "Buffalo Bills" } },
        { homeAway: "away" as const, winner: false, score: 10, team: { abbreviation: "NYJ", displayName: "New York Jets" } },
      ] }] }] };
    const [g] = parseResults(data, 1);
    expect(g.inProgress).toBe(true);
    expect(g.completed).toBe(false);
    expect(g.homeScore).toBe(14);
    expect(g.awayScore).toBe(10);
    expect(g.winner).toBeNull();
    expect(g.statusDetail).toBe("Q3 5:22");
  });
});
