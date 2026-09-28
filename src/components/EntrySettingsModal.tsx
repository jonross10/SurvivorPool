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
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-surface-2"}`}
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
  // Buffer pick-due locally so typing stays smooth; commit to the server on blur /
  // day change rather than on every keystroke (which would fight the input).
  const [due, setDue] = useState(pickDue ?? { day: 0, time: "13:00" }); // default Sun 1:00 PM
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-80 rounded-2xl border border-line bg-surface p-5 text-fg shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl uppercase tracking-wide">Entry settings — {entryName}</h3>
          <button onClick={onClose} className="text-muted transition-colors hover:text-fg">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-fg">Pool</span>
            <input
              defaultValue={pool}
              onBlur={(e) => { const v = e.target.value.trim() || "main"; if (v !== pool) onSetPool(v); }}
              title="Entries in the same pool are planned together"
              className="w-40 rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </label>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-fg">
              Tie counts as surviving
              <span className="block text-xs font-normal text-muted">Off = a tie eliminates this entry</span>
            </span>
            <Toggle on={tiesSurvive} onChange={onToggleTies} />
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-fg">Min. win chance</span>
              <span className="font-semibold text-fg">{Math.round(floor * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={0.95} step={0.05}
              value={floor}
              onChange={(e) => setFloor(Number(e.target.value))}
              onPointerUp={commitFloor}
              onBlur={commitFloor}
              className="mt-1 w-full accent-accent"
            />
            <p className="text-xs text-muted">Won&apos;t suggest a team below this win chance for the current week.</p>
          </div>

          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-fg">Pick due by</span>
              <span className="text-xs text-muted">{DAYS[due.day]} at {label12h(due.time)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={due.day}
                onChange={(e) => { const next = { ...due, day: Number(e.target.value) }; setDue(next); onSetPickDue(next); }}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
              >
                {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <span className="text-sm text-muted">at</span>
              <input
                type="time"
                value={due.time}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const next = { ...due, time: e.target.value };
                  setDue(next);        // local state → smooth typing
                  onSetPickDue(next);  // commit the fresh value (no stale-closure)
                }}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
          <button onClick={onDelete} className="text-sm font-bold text-danger transition-colors hover:opacity-80">
            Delete entry
          </button>
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-fg transition-colors hover:bg-surface-2">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
