import { describe, it, expect } from "vitest";
import { normalizeTeam, TEAMS } from "@/lib/teams";

describe("normalizeTeam", () => {
  it("maps full names to abbreviations", () => {
    expect(normalizeTeam("Green Bay")).toBe("GB");
    expect(normalizeTeam("N.Y. Giants")).toBe("NYG");
    expect(normalizeTeam("NY Giants")).toBe("NYG");
    expect(normalizeTeam("Kansas City")).toBe("KC");
  });
  it("passes through valid abbreviations", () => {
    expect(normalizeTeam("BUF")).toBe("BUF");
  });
  it("throws on unknown input", () => {
    expect(() => normalizeTeam("Narnia")).toThrow();
  });
  it("TEAMS has 32 entries", () => {
    expect(TEAMS.length).toBe(32);
  });
});
