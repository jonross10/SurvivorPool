"use client";
import { useEffect, useState } from "react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Decode a base64url VAPID key into the Uint8Array the Push API expects. */
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "on" | "off" | "denied";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window) ||
      !VAPID
    ) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (Notification.permission === "denied") setState("denied");
        else setState(sub ? "on" : "off");
      })
      .catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID as string) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        if (res.status === 401) window.location.href = "/signin";
        return;
      }
      setState("on");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await fetch("/api/push/test", { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Checking notifications…</p>;
  if (state === "unsupported") return <p className="text-sm text-muted">Notifications aren&apos;t supported in this browser.</p>;
  if (state === "denied") {
    return <p className="text-sm text-muted">Notifications are blocked. Enable them in your browser settings, then reload.</p>;
  }

  const on = state === "on";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-fg">Push notifications</div>
          <div className="text-xs text-muted">{on ? "On for this device" : "Off"}</div>
        </div>
        <button onClick={on ? disable : enable} disabled={busy} className={on ? "btn-ghost" : "btn-primary"}>
          {busy ? "…" : on ? "Disable" : "Enable"}
        </button>
      </div>
      {/* TEMPORARY test-push button — remove once Klaviyo flows are set up. */}
      {on && (
        <button onClick={sendTest} disabled={busy} className="btn-ghost w-full">
          Send test notification
        </button>
      )}
    </div>
  );
}
