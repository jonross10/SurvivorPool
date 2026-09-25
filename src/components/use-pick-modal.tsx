"use client";
import { useState } from "react";
import type { WinProb } from "@/lib/types";
import { unwrapMany } from "@/lib/jsonapi-client";
import { recordPick, removePick, setPickOverride, clearPickOverride, errorDetail } from "@/lib/api-client";
import PickModal from "./PickModal";

/** Owns the week pick/override modal and its API calls. `reload` re-fetches page data after a change. */
export function usePickModal(reload: () => void) {
  const [modal, setModal] = useState<{ entry: string; week: number; current?: string } | null>(null);
  const [wps, setWps] = useState<WinProb[]>([]);

  async function open(entry: string, week: number, current?: string) {
    setModal({ entry, week, current });
    setWps([]);
    const doc = await (await fetch(`/api/grid?filter[entry]=${encodeURIComponent(entry)}`)).json();
    setWps(unwrapMany<WinProb>(doc));
  }

  async function pick(entry: string, week: number, team: string, prob: number) {
    if (modal?.current && modal.current !== team) await removePick(entry, week);
    const res = await recordPick(entry, week, team, prob);
    if (!res.ok) alert(await errorDetail(res, "Pick failed"));
    setModal(null);
    reload();
  }
  async function clear(entry: string, week: number) { await removePick(entry, week); setModal(null); reload(); }
  async function override(entry: string, week: number, outcome: "survived" | "out" | "revived") {
    await setPickOverride(entry, week, outcome); setModal(null); reload();
  }
  async function clearOverride(entry: string, week: number) { await clearPickOverride(entry, week); setModal(null); reload(); }

  function render(ranks: Record<string, number>) {
    if (!modal) return null;
    return (
      <PickModal
        entry={modal.entry}
        week={modal.week}
        current={modal.current}
        wps={wps}
        ranks={ranks}
        onClose={() => setModal(null)}
        onClear={clear}
        onPick={pick}
        onOverride={override}
        onClearOverride={clearOverride}
      />
    );
  }

  return { open, render };
}
