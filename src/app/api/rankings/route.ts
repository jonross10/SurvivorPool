import { getCache } from "@/lib/db/cache-repo";
import { computeRanks } from "@/lib/rankings";
import { resource, document, jsonApi } from "@/lib/jsonapi";
import type { TeamStrength } from "@/lib/types";

export async function GET() {
  const strengths = (await getCache<TeamStrength[]>("fpi"))?.payload ?? [];
  const ranks = computeRanks(strengths);
  const fpiByTeam = Object.fromEntries(strengths.map((s) => [s.team, s.fpi]));
  const data = Object.entries(ranks).map(([team, rank]) =>
    resource("ranking", team, { team, rank, fpi: fpiByTeam[team] ?? null }),
  );
  return jsonApi(document(data));
}
