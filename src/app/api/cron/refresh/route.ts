import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { currentSeason } from "@/lib/week";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonApi(errorDocument([{ status: "401", title: "Unauthorized" }]), 401);
  }
  await ingestAll(Number(process.env.NFL_SEASON) || currentSeason(new Date()), process.env.ODDS_API_KEY ?? "");
  return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString() }));
}
