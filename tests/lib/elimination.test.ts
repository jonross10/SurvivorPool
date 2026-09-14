import { describe, it, expect } from "vitest";
import { pickResultViews } from "@/lib/elimination";
import type { GameResult } from "@/lib/types";

const results: GameResult[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "", homeScore: 24, awayScore: 17,
    winner: "BUF", completed: true, inProgress: false, statusDetail: "Final" },
];

describe("pickResultViews", () => {
  it("builds a per-week view with the picked team's score first", () => {
    const views = pickResultViews({ 1: "BUF" }, results, { 1: "won" });
    expect(views[1]).toEqual({
      week: 1, team: "BUF", outcome: "won", teamScore: 24, oppScore: 17,
      opponent: "NYJ", statusDetail: "Final",
    });
  });
  it("orients scores from the away team's perspective when they were picked", () => {
    const views = pickResultViews({ 1: "NYJ" }, results, { 1: "lost" });
    expect(views[1].teamScore).toBe(17);
    expect(views[1].oppScore).toBe(24);
    expect(views[1].opponent).toBe("BUF");
  });
  it("returns a pending view when no result exists yet", () => {
    const views = pickResultViews({ 2: "KC" }, results, {});
    expect(views[2]).toEqual({
      week: 2, team: "KC", outcome: "pending", teamScore: null, oppScore: null,
      opponent: null, statusDetail: "",
    });
  });
});
