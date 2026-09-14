import { setOverride, clearOverride, type OverrideOutcome } from "@/lib/db/pick-overrides-repo";
import { getEntries } from "@/lib/db/entries-repo";
import { nameToId } from "@/lib/entries-util";
import { resource, document, metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

interface Attrs { entry: string; week: number; outcome: OverrideOutcome }

async function readAttrs(req: Request): Promise<Partial<Attrs>> {
  const body = await req.json().catch(() => ({}));
  return body?.data?.attributes ?? {};
}

function isValidWeek(week: unknown): week is number {
  return typeof week === "number" && Number.isInteger(week) && week >= 1;
}

export async function POST(req: Request) {
  const { entry, week, outcome } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || !isValidWeek(week) || (outcome !== "survived" && outcome !== "out")) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid override", detail: "entry, a positive integer week, and outcome (survived|out) are required" }]),
      400,
    );
  }
  await setOverride(entryId, week, outcome);
  return jsonApi(document(resource("pick-override", `${entryId}:${week}`, { entry, week, outcome })), 201);
}

export async function DELETE(req: Request) {
  const { entry, week } = await readAttrs(req);
  const entryId = entry ? nameToId(await getEntries())[entry] : undefined;
  if (!entryId || !isValidWeek(week)) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid request", detail: "entry and a positive integer week are required" }]),
      400,
    );
  }
  const deleted = await clearOverride(entryId, week);
  return jsonApi(metaDocument({ deleted }));
}
