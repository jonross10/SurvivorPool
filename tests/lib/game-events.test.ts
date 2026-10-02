import { describe, it, expect } from "vitest";
import { detectEvents, eventMessage, clockToSeconds, isLiveEvent } from "@/lib/game-events";
import type { GameResult } from "@/lib/types";

const base: GameResult = {
  week: 4, home: "BAL", away: "CIN", kickoff: "2026-09-27T17:00:00Z",
  homeScore: null, awayScore: null, winner: null, completed: false, inProgress: false,
  statusDetail: "",
};

describe("clockToSeconds", () => {
  it("parses M:SS", () => {
    expect(clockToSeconds("2:14")).toBe(134);
    expect(clockToSeconds("12:00")).toBe(720);
  });
  it("returns null for junk/empty", () => {
    expect(clockToSeconds(null)).toBeNull();
    expect(clockToSeconds("Final")).toBeNull();
  });
});

describe("detectEvents", () => {
  it("pre-game → no events", () => {
    expect(detectEvents(base, "BAL")).toEqual([]);
  });

  it("final → won/lost/tie from the picked team's POV", () => {
    const won = { ...base, completed: true, winner: "BAL", homeScore: 20, awayScore: 10 };
    expect(detectEvents(won, "BAL")).toEqual([{ type: "final", outcome: "won" }]);
    expect(detectEvents(won, "CIN")).toEqual([{ type: "final", outcome: "lost" }]);
    const tie = { ...base, completed: true, winner: null, homeScore: 20, awayScore: 20 };
    expect(detectEvents(tie, "BAL")).toEqual([{ type: "final", outcome: "tie" }]);
  });

  it("halftime via statusName or detail", () => {
    const half = { ...base, inProgress: true, statusName: "STATUS_HALFTIME", period: 2, homeScore: 14, awayScore: 7 };
    expect(detectEvents(half, "BAL")).toEqual([{ type: "halftime" }]);
    const half2 = { ...base, inProgress: true, statusDetail: "Halftime", period: 2 };
    expect(detectEvents(half2, "BAL")).toEqual([{ type: "halftime" }]);
  });

  it("close: Q4, ≤5:00, one-score margin", () => {
    const close = { ...base, inProgress: true, period: 4, clock: "2:14", homeScore: 21, awayScore: 17, statusName: "STATUS_IN_PROGRESS" };
    expect(detectEvents(close, "BAL")).toEqual([{ type: "close" }]);
  });

  it("not close when blowout, early, or not Q4", () => {
    expect(detectEvents({ ...base, inProgress: true, period: 4, clock: "2:14", homeScore: 31, awayScore: 10 }, "BAL")).toEqual([]);
    expect(detectEvents({ ...base, inProgress: true, period: 4, clock: "9:00", homeScore: 21, awayScore: 17 }, "BAL")).toEqual([]);
    expect(detectEvents({ ...base, inProgress: true, period: 2, clock: "2:14", homeScore: 21, awayScore: 17 }, "BAL")).toEqual([]);
  });

  it("completed takes precedence over a close-looking score", () => {
    const done = { ...base, completed: true, winner: "BAL", period: 4, clock: "0:00", homeScore: 21, awayScore: 17 };
    expect(detectEvents(done, "BAL")).toEqual([{ type: "final", outcome: "won" }]);
  });
});

describe("isLiveEvent", () => {
  it("final is not live; halftime/close are", () => {
    expect(isLiveEvent("final")).toBe(false);
    expect(isLiveEvent("halftime")).toBe(true);
    expect(isLiveEvent("close")).toBe(true);
  });
});

describe("eventMessage", () => {
  const won = { ...base, completed: true, winner: "BAL", homeScore: 20, awayScore: 10 };
  it("final win", () => {
    const m = eventMessage("Test", won, "BAL", { type: "final", outcome: "won" });
    expect(m.title).toContain("survived");
    expect(m.body).toBe("BAL beat CIN 20-10.");
  });
  it("final loss from away team's POV", () => {
    const m = eventMessage("Test", won, "CIN", { type: "final", outcome: "lost" });
    expect(m.title).toContain("out");
    expect(m.body).toBe("CIN lost to BAL 10-20.");
  });
  it("halftime shows lead/trail", () => {
    const half = { ...base, inProgress: true, statusName: "STATUS_HALFTIME", period: 2, homeScore: 14, awayScore: 7 };
    const m = eventMessage("Test", half, "BAL", { type: "halftime" });
    expect(m.body).toBe("BAL vs CIN — BAL leads 14-7.");
  });
  it("close game mentions the clock and quarter", () => {
    const close = { ...base, inProgress: true, period: 4, clock: "2:14", homeScore: 17, awayScore: 21 };
    const m = eventMessage("Test", close, "BAL", { type: "close" });
    expect(m.title).toContain("close");
    expect(m.body).toContain("2:14 left");
    expect(m.body).toContain("Q4");
    expect(m.body).toContain("BAL trails 17-21");
  });
});
