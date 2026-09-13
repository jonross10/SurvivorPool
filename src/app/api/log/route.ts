import { NextResponse } from "next/server";
import { getPicks } from "@/lib/db/picks-repo";
import { ENTRIES } from "@/lib/entries";

export async function GET() {
  const log: Record<string, { week: number; team: string }[]> = {};
  for (const e of ENTRIES) log[e.name] = await getPicks(e.id);
  return NextResponse.json({ log });
}
