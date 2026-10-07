import { describe, it, expect } from "vitest";
import { parseInjuries, injuriesTtlMs } from "@/lib/sources/injuries";
import type { Matchup } from "@/lib/types";

const players = [
  { full_name: "Starting QB", position: "QB", team: "BAL", injury_status: "Questionable", depth_chart_order: 1, injury_body_part: "Knee" },
  { full_name: "Backup QB", position: "QB", team: "BAL", injury_status: "Out", depth_chart_order: 2, injury_body_part: "Ankle" },
  { full_name: "Star WR", position: "WR", team: "BAL", injury_status: "Out", depth_chart_order: 1, injury_body_part: "Hamstring" },
  { full_name: "Depth WR", position: "WR", team: "BAL", injury_status: "Questionable", depth_chart_order: 6, injury_body_part: "Toe" }, // backup — dropped
  { full_name: "Healthy RB", position: "RB", team: "BAL", injury_status: "Active", depth_chart_order: 1 }, // not notable — dropped
  { full_name: "IR Starter", position: "WR", team: "BAL", injury_status: "IR", depth_chart_order: 1 }, // long-term — dropped
  { full_name: "Free Agent", position: "WR", team: null, injury_status: "Out", depth_chart_order: 1 }, // no team — dropped
  { full_name: "Other Team", position: "QB", team: "CIN", injury_status: "Doubtful", depth_chart_order: 1, injury_body_part: "Shoulder" },
];

describe("parseInjuries", () => {
  it("keeps starters (depth ≤ 2) and any QB; drops backups, healthy, and teamless players", () => {
    const map = parseInjuries(players);
    const bal = map.BAL.map((i) => i.player);
    expect(bal).toContain("Starting QB");
    expect(bal).toContain("Backup QB"); // QB kept even at depth 2
    expect(bal).toContain("Star WR");   // starter
    expect(bal).not.toContain("Depth WR");  // backup WR
    expect(bal).not.toContain("Healthy RB"); // Active status
    expect(bal).not.toContain("IR Starter"); // IR is long-term, not game-day
    expect(map.BAL.find((i) => i.player === "Free Agent")).toBeUndefined();
  });

  it("groups by team and carries position/status/bodyPart/isQB", () => {
    const map = parseInjuries(players);
    expect(map.CIN).toEqual([
      { team: "CIN", player: "Other Team", position: "QB", status: "Doubtful", isQB: true, bodyPart: "Shoulder" },
    ]);
  });

  it("sorts QB first, then worst status first", () => {
    const map = parseInjuries(players);
    expect(map.BAL[0].player).toBe("Backup QB"); // QB + Out beats QB + Questionable
    expect(map.BAL[1].player).toBe("Starting QB"); // QB
    expect(map.BAL[2].player).toBe("Star WR"); // non-QB last
  });
});

describe("injuriesTtlMs", () => {
  const now = new Date("2026-10-04T17:30:00Z");
  it("uses the short TTL when a game is near kickoff or live", () => {
    const sched: Matchup[] = [{ week: 5, home: "BAL", away: "CIN", kickoff: "2026-10-04T18:00:00Z" }]; // 30 min out
    expect(injuriesTtlMs(sched, now)).toBe(10 * 60 * 1000);
  });
  it("uses the long TTL when no game is near", () => {
    const sched: Matchup[] = [{ week: 6, home: "BAL", away: "CIN", kickoff: "2026-10-11T18:00:00Z" }]; // a week out
    expect(injuriesTtlMs(sched, now)).toBe(12 * 60 * 60 * 1000);
  });
});
