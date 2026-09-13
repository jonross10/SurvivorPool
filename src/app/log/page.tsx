"use client";
import { useEffect, useState } from "react";
import { unwrapMany } from "@/lib/jsonapi-client";
import TeamRow from "@/components/TeamRow";

interface PickAttrs { entry: string; week: number; team: string }

export default function LogPage() {
  const [picks, setPicks] = useState<PickAttrs[]>([]);
  useEffect(() => {
    fetch("/api/log").then((r) => r.json()).then((doc) => setPicks(unwrapMany<PickAttrs>(doc)));
  }, []);

  const byEntry = new Map<string, PickAttrs[]>();
  for (const p of picks) {
    if (!byEntry.has(p.entry)) byEntry.set(p.entry, []);
    byEntry.get(p.entry)!.push(p);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Pick Log</h1>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[...byEntry.entries()].map(([entry, ps]) => (
          <div key={entry} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-bold">{entry}</h3>
            <ul className="mt-2 space-y-1.5">
              {ps.sort((a, b) => a.week - b.week).map((p) => (
                <li key={p.week} className="flex items-center gap-2 text-sm">
                  <span className="w-8 text-xs font-medium text-slate-400">W{p.week}</span>
                  <TeamRow abbr={p.team} size={20} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
