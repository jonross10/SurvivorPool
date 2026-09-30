import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { requireCron } from "@/lib/cron-auth";
import { snapshotPregameProbs } from "@/lib/win-prob";
import { resolveSeason } from "@/lib/week";

export async function GET(req: Request) {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  try {
    const result = await ingestAll(
      resolveSeason(),
      process.env.ODDS_API_KEY ?? "",
    );
    const pregame = await snapshotPregameProbs();
    return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString(), ...result, pregame }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[cron] ingest failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Cron refresh failed", detail }]), 500);
  }
}
