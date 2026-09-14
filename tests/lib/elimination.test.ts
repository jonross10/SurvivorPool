import { describe, it, expect } from "vitest";
import { pickResultViews, outcomeForWeek, deriveEntryStatus } from "@/lib/elimination";
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

function res(over: Partial<GameResult>): GameResult {
  return { week: 1, home: "BUF", away: "NYJ", kickoff: "", homeScore: null, awayScore: null,
    winner: null, completed: false, inProgress: false, statusDetail: "", ...over };
}

describe("outcomeForWeek", () => {
  it("won when the picked team is the winner", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: "BUF" }), true)).toBe("won");
  });
  it("lost when the other team won", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: "NYJ" }), true)).toBe("lost");
  });
  it("tie survives when ties_survive is true", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: null }), true)).toBe("tie");
  });
  it("tie counts as a loss when ties_survive is false", () => {
    expect(outcomeForWeek("BUF", res({ completed: true, winner: null }), false)).toBe("lost");
  });
  it("live for an in-progress game", () => {
    expect(outcomeForWeek("BUF", res({ inProgress: true }), true)).toBe("live");
  });
  it("pending when there is no result", () => {
    expect(outcomeForWeek("BUF", undefined, true)).toBe("pending");
  });
});

describe("deriveEntryStatus", () => {
  const results: GameResult[] = [
    res({ week: 1, home: "BUF", away: "NYJ", winner: "BUF", completed: true }),
    res({ week: 2, home: "KC", away: "DET", winner: "DET", completed: true }),
    res({ week: 3, home: "SF", away: "LAR", winner: "LAR", completed: true }),
  ];
  it("survives when every pick won", () => {
    const s = deriveEntryStatus({ 1: "BUF" }, results, {}, true);
    expect(s.eliminated).toBe(false);
    expect(s.eliminatedWeek).toBeNull();
    expect(s.byWeek[1]).toBe("won");
  });
  it("eliminates at the first losing week", () => {
    const s = deriveEntryStatus({ 1: "BUF", 2: "KC" }, results, {}, true);
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(2);
  });
  it("a 'survived' override forgives that week but a later loss re-eliminates", () => {
    const s = deriveEntryStatus({ 2: "KC", 3: "SF" }, results, { 2: "survived" }, true);
    expect(s.byWeek[2]).toBe("won");
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(3);
  });
  it("an 'out' override eliminates even without a detected loss", () => {
    const s = deriveEntryStatus({ 1: "BUF" }, results, { 1: "out" }, true);
    expect(s.eliminated).toBe(true);
    expect(s.eliminatedWeek).toBe(1);
  });
  it("respects ties_survive=false", () => {
    const tie = [res({ week: 1, home: "BUF", away: "NYJ", winner: null, completed: true })];
    expect(deriveEntryStatus({ 1: "BUF" }, tie, {}, false).eliminated).toBe(true);
    expect(deriveEntryStatus({ 1: "BUF" }, tie, {}, true).eliminated).toBe(false);
  });
});
