import { recordPick, removePick } from "@/lib/db/picks-repo";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { winProbFor } from "@/lib/win-prob";
import { resolveActorUserId } from "@/lib/agent-auth";
import { syncOwnerInBackground } from "@/lib/klaviyo-objects";
import { resource, document, metaDocument, errorDocument, jsonApi, unauthorized } from "@/lib/jsonapi";

interface PickAttrs { entry: string; week: number; team: string; winProb?: number }

async function readAttrs(req: Request): Promise<Partial<PickAttrs>> {
  const body = await req.json().catch(() => ({}));
  return body?.data?.attributes ?? {};
}

export async function POST(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return unauthorized();
  const { entry, week, team, winProb } = await readAttrs(req);
  // Name lookup is scoped to the actor's own entries, so a resolved id is theirs.
  const entryId = entry ? nameToId(await getEntries(userId))[entry] : undefined;
  if (!entryId || week === undefined || !team) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid pick", detail: "entry, week, and team are required" }]), 400);
  }
  try {
    // Record the server-computed win prob so it's correct regardless of which
    // page made the pick; fall back to any client-supplied value, else 0.
    const prob = (await winProbFor(week, team)) ?? winProb ?? 0;
    await recordPick(entryId, week, team, prob);
    syncOwnerInBackground(userId);
    return jsonApi(
      document(resource("pick", `${entryId}:${week}`, { entry, week, team, winProb: prob })),
      201,
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return jsonApi(errorDocument([{ status: "409", title: "Pick conflict", detail }]), 409);
  }
}

export async function DELETE(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return unauthorized();
  const { entry, week } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries(userId))[entry] : undefined;
  if (!entryId || week === undefined) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "entry and week are required" }]), 400);
  }
  const deleted = await removePick(entryId, week);
  syncOwnerInBackground(userId);
  return jsonApi(metaDocument({ deleted }));
}
