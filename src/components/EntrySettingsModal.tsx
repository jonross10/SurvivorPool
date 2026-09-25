"use client";
import { useState } from "react";

/** Per-entry settings modal: pool, tie rule, min win chance, and delete. */
export default function EntrySettingsModal({
  entryName, pool, tiesSurvive, minWinChance, onClose, onSetPool, onToggleTies, onSetFloor, onDelete,
}: {
  entryName: string;
  pool: string;
  tiesSurvive: boolean;
  minWinChance: number;
  onClose: () => void;
  onSetPool: (pool: string) => void;
  onToggleTies: (value: boolean) => void;
  onSetFloor: (value: number) => void;
  onDelete: () => void;
}) {
  const [floor, setFloor] = useState(minWinChance);
  const commitFloor = () => { if (floor !== minWinChance) onSetFloor(floor); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-80 rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Entry settings — {entryName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">Pool</span>
            <input
              defaultValue={pool}
              onBlur={(e) => { const v = e.target.value.trim() || "main"; if (v !== pool) onSetPool(v); }}
              title="Entries in the same pool are planned together"
              className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">
              Tie counts as surviving
              <span className="block text-xs font-normal text-slate-400">Off = a tie eliminates this entry</span>
            </span>
            <input
              type="checkbox"
              checked={tiesSurvive}
              onChange={(e) => onToggleTies(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
          </label>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Min. win chance</span>
              <span className="font-semibold text-slate-700">{Math.round(floor * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={0.95} step={0.05}
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              onPointerUp={commitFloor}
              onBlur={commitFloor}
              className="mt-1 w-full accent-emerald-600"
            />
            <p className="text-xs text-slate-400">Won&apos;t suggest a team below this win chance for the current week.</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
          <button onClick={onDelete} className="text-sm font-medium text-red-600 hover:text-red-700">
            Delete entry
          </button>
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
