import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, jsonApi } from "@/lib/jsonapi";

export async function POST() {
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString() }));
}
