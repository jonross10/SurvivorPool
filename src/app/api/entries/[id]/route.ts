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
  const settings = body?.data?.attributes?.settings as EntrySettings | undefined;
  if (!settings || typeof settings !== "object") {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "A settings object is required" }]),
      400,
    );
  }
  await updateSettings(id, settings);
  return jsonApi(metaDocument({ ok: true }));
}
