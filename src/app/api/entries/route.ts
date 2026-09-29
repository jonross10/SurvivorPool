import { createEntry } from "@/lib/db/entries-repo";
import { EmptyNameError, DuplicateNameError, normalizeSettings, validateSettings } from "@/lib/entries-util";
import { resolveActorUserId } from "@/lib/agent-auth";
import { getCache } from "@/lib/db/cache-repo";
import { getResultsFresh } from "@/lib/sources/results";
import { getEntryStatuses } from "@/lib/entry-status";
import { currentWeek, resolveSeason } from "@/lib/week";
import { resource, document, errorDocument, jsonApi } from "@/lib/jsonapi";
import type { Matchup } from "@/lib/types";

export async function GET(req: Request) {
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const schedule = (await getCache<Matchup[]>("schedule"))?.payload ?? [];
  const week = currentWeek(schedule, new Date());
  const results = await getResultsFresh(week, resolveSeason());
  const statuses = await getEntryStatuses(results, userId);
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
  const userId = await resolveActorUserId(req);
  if (!userId) return jsonApi(errorDocument([{ status: "401", title: "Unauthorized", detail: "Sign in required" }]), 401);
  const body = await req.json().catch(() => ({}));
  const attrs = body?.data?.attributes ?? {};
  const name: string = attrs.name ?? "";
  // Settings are optional on create; agents may pass any of pool / ties_survive /
  // min_win_chance / pick_due (as strings), which we coerce and validate.
  const settings = normalizeSettings(attrs.settings ?? {});
  const settingsError = validateSettings(settings);
  if (settingsError) {
    return jsonApi(errorDocument([{ status: "400", title: "Invalid settings", detail: settingsError }]), 400);
  }
  try {
    const e = await createEntry(userId, name, settings);
    return jsonApi(document(resource("entry", e.id, { name: e.name, settings: e.settings })), 201);
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
