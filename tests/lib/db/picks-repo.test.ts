import { describe, it, expect } from "vitest";
import { deriveUsedTeams } from "@/lib/db/picks-repo";

describe("deriveUsedTeams", () => {
  it("collects the set of teams already picked by an entry", () => {
    const rows = [
      { week: 1, team: "BUF" },
      { week: 2, team: "KC" },
    ];
    const used = deriveUsedTeams(rows);
    expect(used.has("BUF")).toBe(true);
    expect(used.has("KC")).toBe(true);
    expect(used.has("SF")).toBe(false);
    expect(used.size).toBe(2);
  });
});
