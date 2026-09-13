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
  it("maps ESPN abbreviation variants to ours", () => {
    expect(normalizeTeam("JAX")).toBe("JAC");
    expect(normalizeTeam("WSH")).toBe("WAS");
  });
  it("maps full 'City Mascot' names (The Odds API) to abbreviations", () => {
    expect(normalizeTeam("Washington Commanders")).toBe("WAS");
    expect(normalizeTeam("Jacksonville Jaguars")).toBe("JAC");
    expect(normalizeTeam("Kansas City Chiefs")).toBe("KC");
    expect(normalizeTeam("San Francisco 49ers")).toBe("SF");
  });
  it("maps legacy relocations", () => {
    expect(normalizeTeam("OAK")).toBe("LV");
    expect(normalizeTeam("San Diego Chargers")).toBe("LAC");
  });
  it("throws on unknown input", () => {
    expect(() => normalizeTeam("Narnia")).toThrow();
  });
  it("TEAMS has 32 entries", () => {
    expect(TEAMS.length).toBe(32);
  });
});
