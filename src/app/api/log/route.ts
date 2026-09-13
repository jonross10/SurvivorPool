import { getPicks } from "@/lib/db/picks-repo";
import { ENTRIES } from "@/lib/entries";
import { resource, document, jsonApi } from "@/lib/jsonapi";

export async function GET() {
  const data = [];
  for (const e of ENTRIES) {
    const picks = await getPicks(e.id);
    for (const p of picks) {
      data.push(resource("pick", `${e.id}:${p.week}`, { entry: e.name, week: p.week, team: p.team }));
    }
  }
  return jsonApi(document(data));
}
