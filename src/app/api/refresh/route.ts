import { ingestAll } from "@/lib/sources/ingest";
import { getCache } from "@/lib/db/cache-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { cooldownRemainingMs } from "@/lib/refresh-cooldown";

/** When the data was last refreshed (the odds cache is written last by ingestAll). */
async function lastFetchedAt(): Promise<string | null> {
  return (await getCache<unknown>("odds"))?.fetchedAt ?? null;
}

export async function GET() {
  const fetchedAt = await lastFetchedAt();
  const remainingMs = cooldownRemainingMs(fetchedAt, new Date());
  return jsonApi(metaDocument({ fetchedAt, canRefreshNow: remainingMs === 0, remainingMs }));
}

export async function POST() {
  const fetchedAt = await lastFetchedAt();
  const remainingMs = cooldownRemainingMs(fetchedAt, new Date());
  if (remainingMs > 0) {
    const mins = Math.ceil(remainingMs / 60000);
    return jsonApi(
      errorDocument([{
        status: "429",
        title: "Refresh rate limited",
        detail: `Stats were refreshed recently. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      }]),
      429,
    );
  }
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString() }));
}
