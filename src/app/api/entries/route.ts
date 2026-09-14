import { createEntry } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError } from "@/lib/entries-util";
import { getCache } from "@/lib/db/cache-repo";
import { getResultsFresh } from "@/lib/sources/results";
import { getEntryStatuses } from "@/lib/entry-status";
import { currentWeek } from "@/lib/week";
import { resource, document, errorDocument, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET() {
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const week = currentWeek(schedule, new Date());
  const results = await getResultsFresh(week, Number(process.env.NFL_SEASON ?? "2026"));
  const statuses = await getEntryStatuses(results);
  const data = statuses.map(({ entry, status }) =>
    resource("entry", entry.id, {
      name: entry.name,
      settings: entry.settings,
      eliminated: status.eliminated,
      eliminatedWeek: status.eliminatedWeek,
    }),
  );
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
