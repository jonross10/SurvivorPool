import { deleteEntry, updateSettings, renameEntry } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError, normalizeSettings, validateSettings } from "@/lib/entries-util";
import { requireAgentWrite } from "@/lib/agent-auth";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAgentWrite(req);
  if (unauth) return unauth;
  const { id } = await params;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauth = requireAgentWrite(req);
  if (unauth) return unauth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? {};
  // Rename: a `name` attribute renames the entry. Handled independently of settings.
  if ("name" in attrs) {
    try {
      await renameEntry(id, attrs.name);
    } catch (err) {
      if (err instanceof EmptyNameError) {
        return jsonApi(errorDocument([{ status: "400", title: "Invalid name", detail: err.message }]), 400);
      }
      if (err instanceof DuplicateNameError) {
        return jsonApi(errorDocument([{ status: "409", title: "Duplicate entry", detail: err.message }]), 409);
      }
      throw err;
    }
    // A name-only PATCH is complete; settings are optional in the same call.
    if (!("settings" in attrs)) return jsonApi(metaDocument({ ok: true }));
  }
  const raw = attrs.settings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonApi(
      errorDocument([{ status: "400", title: "Invalid settings", detail: "A settings object is required" }]),
      400,
    );
  }
  const settings = normalizeSettings(raw as Record<string, unknown>);
  const settingsError = validateSettings(settings);
  if (settingsError) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid settings", detail: settingsError }]), 400);
  }
  await updateSettings(id, settings);
  return jsonApi(metaDocument({ ok: true }));
}
