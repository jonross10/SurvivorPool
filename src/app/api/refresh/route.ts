import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/sources/ingest";

export async function POST() {
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return NextResponse.json({ ok: true });
}
