import { NextResponse } from "next/server";
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildWinProbs } from "@/lib/winprob-matrix";
import { currentWeek } from "@/lib/week";
import { NAME_TO_ID, ENTRIES } from "@/lib/entries";
import type { Matchup, TeamStrength, MoneylineGame } from "@/lib/types";

export async function GET(req: Request) {
  const entry = new URL(req.url).searchParams.get("entry") ?? ENTRIES[0].name;
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];
  const used = await getUsedTeams(NAME_TO_ID[entry] ?? ENTRIES[0].id);
  const week = currentWeek(schedule, new Date());
  const wps = buildWinProbs(schedule, strengths, odds, week, used);
  return NextResponse.json({ week, winProbs: wps });
}
