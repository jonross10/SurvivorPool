"use client";
import { useEffect, useState } from "react";

/** Fetches the team → power-ranking (#1 best) map from /api/rankings. */
export function useRanks(): Record<string, number> {
  const [ranks, setRanks] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch("/api/rankings")
      .then((r) => r.json())
      .then((doc) => {
        const m: Record<string, number> = {};
        for (const e of doc.data ?? []) m[e.attributes.team] = e.attributes.rank;
        setRanks(m);
      });
  }, []);
  return ranks;
}
