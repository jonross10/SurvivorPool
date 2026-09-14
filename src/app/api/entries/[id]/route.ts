import { deleteEntry, updateSettings } from "@/lib/db/entries-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";
import type { EntrySettings } from "@/lib/types";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const settings = body?.data?.attributes?.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "A settings object is required" }]),
      400,
    );
  }
  if ("ties_survive" in settings && typeof settings.ties_survive !== "boolean") {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "ties_survive must be a boolean" }]),
      400,
    );
  }
  await updateSettings(id, settings as EntrySettings);
  return jsonApi(metaDocument({ ok: true }));
}
