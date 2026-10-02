"use client";
import { useEffect, useState } from "react";

interface Prefs { notifyFinal: boolean; notifyLive: boolean }

/** "Notify me about" toggles: win/loss results vs in-game updates. Gated server-side when events fire. */
export default function NotificationPrefs() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/notification-prefs")
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => doc?.meta && setPrefs({ notifyFinal: !!doc.meta.notifyFinal, notifyLive: !!doc.meta.notifyLive }))
      .catch(() => {});
  }, []);

  async function update(patch: Partial<Prefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch("/api/notification-prefs", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) setPrefs(prefs); // revert on failure
    } catch {
      setPrefs(prefs);
    } finally {
      setBusy(false);
    }
  }

  if (!prefs) return null;

  const Row = ({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-semibold text-fg">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <button onClick={onToggle} disabled={busy} className={on ? "btn-primary" : "btn-ghost"}>
        {on ? "On" : "Off"}
      </button>
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
      <div className="text-xs font-bold uppercase tracking-wider text-muted">Notify me about</div>
      <Row
        label="Win / loss results"
        hint="When your pick's game goes final"
        on={prefs.notifyFinal}
        onToggle={() => update({ notifyFinal: !prefs.notifyFinal })}
      />
      <Row
        label="Game updates"
        hint="Halftime score and close-game alerts"
        on={prefs.notifyLive}
        onToggle={() => update({ notifyLive: !prefs.notifyLive })}
      />
    </div>
  );
}
