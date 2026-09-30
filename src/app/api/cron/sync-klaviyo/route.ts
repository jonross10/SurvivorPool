import { getAllOwnerIds } from "@/lib/db/entries-repo";
import { syncAllOwners } from "@/lib/klaviyo-objects";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import { requireCron } from "@/lib/cron-auth";

// Nightly reconcile: re-sync every owner's entries + picks to Klaviyo custom objects,
// catching derived changes (game scores/results) that don't come through a user write.
export async function GET(req: Request) {
  const unauth = requireCron(req);
  if (unauth) return unauth;
  try {
    const owners = await getAllOwnerIds();
    await syncAllOwners(owners);
    return jsonApi(metaDocument({ ok: true, owners: owners.length, syncedAt: new Date().toISOString() }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[cron] klaviyo sync failed:", detail);
    return jsonApi(errorDocument([{ status: "500", title: "Cron sync failed", detail }]), 500);
  }
}
