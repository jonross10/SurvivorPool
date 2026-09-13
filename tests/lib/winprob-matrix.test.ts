import { describe, it, expect } from "vitest";
import { buildWinProbs } from "@/lib/winprob-matrix";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const schedule: Matchup[] = [
  { week: 1, home: "BUF", away: "NYJ", kickoff: "2026-09-10T00:00:00Z" },
  { week: 1, home: "KC", away: "DET", kickoff: "2026-09-10T00:00:00Z" },
  { week: 2, home: "BUF", away: "KC", kickoff: "2026-09-17T00:00:00Z" },
  // NYJ + DET on bye in week 2
];
const strengths: TeamStrength[] = [
  { team: "BUF", fpi: 6 }, { team: "KC", fpi: 8 },
  { team: "NYJ", fpi: -2 }, { team: "DET", fpi: 4 },
];
const odds: MoneylineGame[] = [
  { week: 1, home: "BUF", away: "NYJ", homeOdds: -300, awayOdds: +250 },
];

describe("buildWinProbs", () => {
  it("uses de-vigged odds when present", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set());
    const buf1 = wps.find((w) => w.week === 1 && w.team === "BUF");
    expect(buf1?.source).toBe("odds");
    expect(buf1!.prob).toBeGreaterThan(0.7);
  });
  it("uses FPI projection when odds are absent", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set());
    const kc1 = wps.find((w) => w.week === 1 && w.team === "KC");
    expect(kc1?.source).toBe("fpi");
  });
  it("excludes used teams", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 1, new Set(["BUF"]));
    expect(wps.some((w) => w.team === "BUF")).toBe(false);
  });
  it("omits past weeks and bye weeks", () => {
    const wps = buildWinProbs(schedule, strengths, odds, 2, new Set());
    expect(wps.some((w) => w.week === 1)).toBe(false); // past
    expect(wps.some((w) => w.week === 2 && w.team === "NYJ")).toBe(false); // bye
  });
});
