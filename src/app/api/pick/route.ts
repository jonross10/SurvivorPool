import { NextResponse } from "next/server";
import { recordPick } from "@/lib/db/picks-repo";

const NAME_TO_ID: Record<string, string> = {
  "Jon 1": "jon1", "Jon 2": "jon2", "Jon 3": "jon3", "Jon 4": "jon4",
};

export async function POST(req: Request) {
  const body = await req.json();
  const { entry, week, team, winProb } = body as {
    entry: string; week: number; team: string; winProb: number;
  };
  const entryId = NAME_TO_ID[entry];
  if (!entryId) return NextResponse.json({ error: "unknown entry" }, { status: 400 });
  try {
    await recordPick(entryId, week, team, winProb ?? 0);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
