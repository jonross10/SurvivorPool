import { NextResponse } from "next/server";
import { getCache } from "@/lib/db/cache-repo";
import { getUsedTeams } from "@/lib/db/picks-repo";
import { buildRecommendations } from "@/lib/recommendations";
import type { Matchup, TeamStrength, MoneylineGame, TeamAbbr } from "@/lib/types";

const ENTRIES = [
  { id: "jon1", name: "Jon 1" }, { id: "jon2", name: "Jon 2" },
  { id: "jon3", name: "Jon 3" }, { id: "jon4", name: "Jon 4" },
];

export async function GET(req: Request) {
  const floor = Number(new URL(req.url).searchParams.get("floor") ?? "0.6");
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const odds = (await getCache<MoneylineGame[]>("odds"))?.payload ?? [];

  const picksByEntry: Record<string, Set<TeamAbbr>> = {};
  for (const e of ENTRIES) picksByEntry[e.name] = await getUsedTeams(e.id);

  const recs = buildRecommendations(schedule, strengths, odds, picksByEntry, new Date(), floor);
  return NextResponse.json({ recommendations: recs });
}
