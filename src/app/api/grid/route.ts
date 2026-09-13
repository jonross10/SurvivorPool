import { NextResponse } from "next/server";
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

const NAME_TO_ID: Record<string, string> = {
  "Jon 1": "jon1", "Jon 2": "jon2", "Jon 3": "jon3", "Jon 4": "jon4",
};

export async function GET(req: Request) {
  const entry = new URL(req.url).searchParams.get("entry") ?? "Jon 1";
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(NAME_TO_ID[entry] ?? "jon1");
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  return NextResponse.json({ week, winProbs: wps });
}
