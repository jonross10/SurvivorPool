import { ingestAll } from "@/lib/sources/ingest";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { currentSeason } from "@/lib/week";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return jsonApi(errorDocument([{ status: "401", title: "Unauthorized" }]), 401);
  }
  try {
    const result = await ingestAll(
      Number(process.env.NFL_SEASON) || currentSeason(new Date()),
      process.env.ODDS_API_KEY ?? "",
    );
    return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString(), ...result }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[cron] ingest failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Cron refresh failed", detail }]), 500);
  }
}
