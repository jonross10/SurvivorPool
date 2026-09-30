import { deleteEntry, updateSettings, renameEntry, getEntryOwner } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError, normalizeSettings, validateSettings } from "@/lib/entries-util";
import { resolveActorUserId } from "@/lib/agent-auth";
import { syncOwnerInBackground, deleteEntryRecordsInBackground } from "@/lib/klaviyo-objects";
import { getPicks } from "@/lib/db/picks-repo";
import { metaDocument, errorDocument, jsonApi } from "@/lib/jsonapi";

/** Resolve the actor and confirm they own entry `id`. Returns the user id or a Response. */
async function authorizeOwner(req: Request, id: string): Promise<string | Response> {
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  if ((await getEntryOwner(id)) !== userId) {
    return jsonApi(errorDocument([{ status: "403", title: "Forbidden", detail: "Not your entry" }]), 403);
  }
  return userId;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeOwner(req, id);
  if (auth instanceof Response) return auth;
  // Capture the pick weeks before deletion so we can remove the matching Klaviyo records.
  const weeks = (await getPicks(id)).map((p) => p.week);
  const deleted = await deleteEntry(id);
  deleteEntryRecordsInBackground(id, weeks);
  syncOwnerInBackground(auth);
  return jsonApi(metaDocument({ deleted }));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeOwner(req, id);
  if (auth instanceof Response) return auth;
  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? {};
  // Rename: a `name` attribute renames the entry. Handled independently of settings.
  if ("name" in attrs) {
    try {
      await renameEntry(id, auth, attrs.name);
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
    if (!("settings" in attrs)) { syncOwnerInBackground(auth); return jsonApi(metaDocument({ ok: true })); }
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
  syncOwnerInBackground(auth);
  return jsonApi(metaDocument({ ok: true }));
}
