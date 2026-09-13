import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOdds } from "@/lib/sources/odds-api";
import type { Matchup } from "@/lib/types";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/odds-api.json"), "utf8"),
);

function scheduleWeekLookup(schedule: Matchup[]) {
  const m = new Map<string, number>();
  for (const s of schedule) m.set(`${s.home}|${s.away}`, s.week);
  return m;
}

describe("parseOdds", () => {
  it("maps each game to a MoneylineGame, averaging books, with week from schedule", () => {
    const schedule: Matchup[] = [
      { week: 1, home: "BUF", away: "NYJ", kickoff: "2025-09-08T00:20:00Z" },
      { week: 1, home: "WAS", away: "JAC", kickoff: "2025-09-08T20:25:00Z" },
    ];
    const games = parseOdds(fixture, scheduleWeekLookup(schedule));
    expect(games.length).toBe(2);
    const buf = games.find((g) => g.home === "BUF")!;
    expect(buf.week).toBe(1);
    expect(buf.homeOdds).toBe(-310); // avg(-300,-320)
    expect(buf.awayOdds).toBe(255);  // avg(250,260)
    expect(buf.homeSpread).toBe(-7.5); // consensus home spread
    const was = games.find((g) => g.home === "WAS")!;
    expect(was.home).toBe("WAS"); // full name normalized
    expect(was.away).toBe("JAC");
    expect(was.homeSpread).toBe(-3);
  });
  it("skips games not found in the schedule week lookup", () => {
    const games = parseOdds(fixture, new Map());
    expect(games.length).toBe(0);
  });
});
