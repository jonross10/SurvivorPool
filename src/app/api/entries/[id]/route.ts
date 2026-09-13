import { deleteEntry } from "@/lib/db/entries-repo";
import { metaDocument, jsonApi } from "@/lib/jsonapi";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteEntry(id);
  return jsonApi(metaDocument({ deleted }));
}
