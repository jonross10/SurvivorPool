import { describe, it, expect } from "vitest";
import { espnLogoAbbr, teamLogoUrl, teamColor } from "@/lib/team-visuals";
import { TEAMS } from "@/lib/teams";

describe("team-visuals", () => {
  it("maps our abbreviations to ESPN logo slugs", () => {
    expect(espnLogoAbbr("JAC")).toBe("jax");
    expect(espnLogoAbbr("WAS")).toBe("wsh");
    expect(espnLogoAbbr("BUF")).toBe("buf");
  });
  it("builds a well-formed CDN URL", () => {
    expect(teamLogoUrl("KC")).toBe("https://a.espncdn.com/i/teamlogos/nfl/500/kc.png");
  });
  it("returns a hex color and valid slug for every one of the 32 teams", () => {
    for (const t of TEAMS) {
      expect(teamColor(t)).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(espnLogoAbbr(t)).toMatch(/^[a-z]{2,3}$/);
    }
  });
});
