import { getEntries, createEntry } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError } from "@/lib/entries-util";
import { resource, document, errorDocument, jsonApi } from "@/lib/jsonapi";

export async function GET() {
  const entries = await getEntries();
  const data = entries.map((e) => resource("entry", e.id, { name: e.name }));
  return jsonApi(document(data));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name: string = body?.data?.attributes?.name ?? "";
  try {
    const e = await createEntry(name);
    return jsonApi(document(resource("entry", e.id, { name: e.name })), 201);
  } catch (err) {
    if (err instanceof EmptyNameError) {
      return jsonApi(errorDocument([{ status: "400", title: "Invalid name", detail: err.message }]), 400);
    }
    if (err instanceof DuplicateNameError) {
      return jsonApi(errorDocument([{ status: "409", title: "Duplicate entry", detail: err.message }]), 409);
    }
    throw err;
  }
}
