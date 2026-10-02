"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { subscribe, getSnapshot, getServerSnapshot, send, reset, reconcile, retry } from "./assistant-store";

// Characters revealed per tick while simulating a streaming response.
const REVEAL_CHARS = 3;
const REVEAL_MS = 16;

export default function AssistantChat() {
  // The conversation lives in a module-level store (assistant-store.ts) so the request
  // lifecycle survives navigating away and back — this component is just a view over it.
  const { messages, busy, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [input, setInput] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Simulated streaming reveal for the LAST message, but only when it's a brand-new agent
  // reply that arrived while mounted. `animatedUpTo` starts at the hydrated message count so
  // pre-existing history (and replies that landed while we were on another tab) just appear.
  const [reveal, setReveal] = useState<{ idx: number; chars: number } | null>(null);
  const animatedUpTo = useRef<number | null>(null);

  useEffect(() => {
    if (animatedUpTo.current === null) { animatedUpTo.current = messages.length; return; }
    if (messages.length <= animatedUpTo.current) { animatedUpTo.current = messages.length; return; }
    animatedUpTo.current = messages.length;
    const idx = messages.length - 1;
    const last = messages[idx];
    if (!last || last.role !== "agent") { setReveal(null); return; }
    const full = last.text.length;
    let shown = 0;
    setReveal({ idx, chars: 0 });
    const timer = setInterval(() => {
      shown = Math.min(full, shown + REVEAL_CHARS);
      setReveal({ idx, chars: shown });
      if (shown >= full) { clearInterval(timer); setReveal(null); }
    }, REVEAL_MS);
    return () => clearInterval(timer);
  }, [messages]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // Reconcile with the server transcript on mount and whenever the app returns to the
  // foreground — this is what recovers a reply if the page was evicted/suspended mid-request
  // (e.g. an iOS PWA backgrounded while the assistant was still thinking).
  useEffect(() => {
    void reconcile();
    const onVisible = () => { if (document.visibilityState === "visible") void reconcile(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function onSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  }

  return (
    <div className="flex h-full flex-col">
      {messages.length > 0 && (
        <div className="flex justify-end border-b border-line px-3 py-1.5">
          <button
            onClick={reset}
            className="rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            ↺ Reset conversation
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted">
            Ask about picks, matchups, or your season plan.
          </p>
        )}
        {messages.map((m, i) => {
          const text = reveal && reveal.idx === i ? m.text.slice(0, reveal.chars) : m.text;
          const streaming = !!reveal && reveal.idx === i;
          return (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "user" ? (
                <div className="flex max-w-[85%] flex-col items-end gap-1">
                  <span className="inline-block whitespace-pre-wrap break-words rounded-2xl bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
                    {m.text}
                  </span>
                  {m.failed && (
                    <button
                      onClick={() => retry(i)}
                      disabled={busy}
                      className="flex items-center gap-1 text-xs font-medium text-danger transition-colors hover:text-fg disabled:opacity-40"
                      aria-label="Resend message"
                      title="Resend message"
                    >
                      <span aria-hidden>↻</span> Failed to send — tap to resend
                    </button>
                  )}
                </div>
              ) : (
                <div className="inline-block max-w-[85%] overflow-hidden break-words rounded-2xl bg-surface-2 px-3 py-2 text-sm text-fg">
                  <div className="assistant-md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                  </div>
                  {streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-muted align-middle" />}
                </div>
              )}
            </div>
          );
        })}
        {busy && <p className="text-sm text-muted">Thinking…</p>}
        {/* A failed send surfaces inline on the message itself (tap to resend); only show a
            standalone error for failures not tied to a specific message. */}
        {error && !messages.some((m) => m.failed) && <p className="text-sm text-danger">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="flex items-center gap-2 border-t border-line p-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          // iOS doesn't shrink the viewport for the keyboard, so the fixed-bottom input can end
          // up hidden behind it. Nudge it into view once the keyboard has animated in.
          onFocus={() => setTimeout(() => inputRef.current?.scrollIntoView({ block: "center" }), 300)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Dismiss the iOS keyboard on send.
              (e.currentTarget as HTMLInputElement).blur();
              onSend();
            }
          }}
          placeholder="Ask the assistant…"
          className="field flex-1"
        />
        <button onClick={onSend} disabled={busy} className="btn-primary">
          Send
        </button>
      </div>
    </div>
  );
}
