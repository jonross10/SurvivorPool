import { recordPick, removePick } from "@/lib/db/picks-repo";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

interface PickAttrs { entry: string; week: number; team: string; winProb?: number }

async function readAttrs(req: Request): Promise<Partial<PickAttrs>> {
  const body = await req.json().catch(() => ({}));
  return body?.data?.attributes ?? {};
}

export async function POST(req: Request) {
  const { entry, week, team, winProb } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || week === undefined || !team) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid pick", detail: "entry, week, and team are required" }]), 400);
  }
  try {
    await recordPick(entryId, week, team, winProb ?? 0);
    return jsonApi(
      document(resource("pick", `${entryId}:${week}`, { entry, week, team, winProb: winProb ?? 0 })),
      201,
    );
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    return jsonApi(errorDocument([{ status: "409", title: "Pick conflict", detail }]), 409);
  }
}

export async function DELETE(req: Request) {
  const { entry, week } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || week === undefined) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid request", detail: "entry and week are required" }]), 400);
  }
  const deleted = await removePick(entryId, week);
  return jsonApi(metaDocument({ deleted }));
}
