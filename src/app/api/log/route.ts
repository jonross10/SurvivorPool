import { NextResponse } from "next/server";
import { getPicks } from "@/lib/db/picks-repo";

const ENTRIES = [
  { id: "jon1", name: "Jon 1" }, { id: "jon2", name: "Jon 2" },
  { id: "jon3", name: "Jon 3" }, { id: "jon4", name: "Jon 4" },
];

export async function GET() {
  const log: Record<string, { week: number; team: string }[]> = {};
  for (const e of ENTRIES) log[e.name] = await getPicks(e.id);
  return NextResponse.json({ log });
}
