import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/sources/ingest";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ingestAll(Number(process.env.NFL_SEASON ?? "2026"), process.env.ODDS_API_KEY ?? "");
  return NextResponse.json({ ok: true });
}
