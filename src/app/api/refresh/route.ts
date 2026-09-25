import { ingestAll } from "@/lib/sources/ingest";
import { getCache } from "@/lib/db/cache-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { cooldownRemainingMs } from "@/lib/refresh-cooldown";
import { resolveSeason } from "@/lib/week";

/** When the data was last refreshed. Anchored on the schedule cache, which is
 *  always written on a successful refresh (odds are best-effort and may not be). */
async function lastFetchedAt(): Promise<string | null> {
  return (await getCache<unknown>("schedule"))?.fetchedAt ?? null;
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
  try {
    const result = await ingestAll(
      resolveSeason(),
      process.env.ODDS_API_KEY ?? "",
    );
    return jsonApi(metaDocument({ ok: true, refreshedAt: new Date().toISOString(), ...result }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[refresh] ingest failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Refresh failed", detail }]), 500);
  }
}
