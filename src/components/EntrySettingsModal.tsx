"use client";
import { useState } from "react";
import { createPortal } from "react-dom";

type PickDue = { day: number; time: string } | null;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** iOS-style on/off toggle. */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Format an HH:MM (24h) time as a friendly 12h label, e.g. "1:00 PM". */
function label12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Per-entry settings modal: pool, tie rule, min win chance, pick deadline, and delete. */
export default function EntrySettingsModal({
  entryName, pool, tiesSurvive, minWinChance, pickDue,
  onClose, onSetPool, onToggleTies, onSetFloor, onSetPickDue, onDelete,
}: {
  entryName: string;
  pool: string;
  tiesSurvive: boolean;
  minWinChance: number;
  pickDue: PickDue;
  onClose: () => void;
  onSetPool: (pool: string) => void;
  onToggleTies: (value: boolean) => void;
  onSetFloor: (value: number) => void;
  onSetPickDue: (value: PickDue) => void;
  onDelete: () => void;
}) {
  const [floor, setFloor] = useState(minWinChance);
  const commitFloor = () => { if (floor !== minWinChance) onSetFloor(floor); };
  const due = pickDue ?? { day: 0, time: "13:00" }; // default Sun 1:00 PM
  if (typeof document === "undefined") return null;
  return createPortal(
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

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-700">
              Tie counts as surviving
              <span className="block text-xs font-normal text-slate-400">Off = a tie eliminates this entry</span>
            </span>
            <Toggle on={tiesSurvive} onChange={onToggleTies} />
          </div>

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

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Pick due by</span>
              <span className="text-xs text-slate-400">{DAYS[due.day]} at {label12h(due.time)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={due.day}
                onChange={(e) => onSetPickDue({ ...due, day: Number(e.target.value) })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              >
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <span className="text-sm text-slate-400">at</span>
              <input
                type="time"
                value={due.time}
                onChange={(e) => e.target.value && onSetPickDue({ ...due, time: e.target.value })}
                className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
            </div>
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
    </div>,
    document.body,
  );
}
