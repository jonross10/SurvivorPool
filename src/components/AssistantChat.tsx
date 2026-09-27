"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Msg { role: "user" | "agent"; text: string; streaming?: boolean }

const CONV_KEY = "assistant_conversation_id";
const MSGS_KEY = "assistant_messages";
// Characters revealed per tick while simulating a streaming response.
const REVEAL_CHARS = 3;
const REVEAL_MS = 16;

export default function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const convId = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  // Hydrate a prior conversation from localStorage so closing the panel (or the
  // tab) doesn't lose history.
  useEffect(() => {
    convId.current = localStorage.getItem(CONV_KEY) ?? undefined;
    try {
      const saved = localStorage.getItem(MSGS_KEY);
      if (saved) setMessages(JSON.parse(saved) as Msg[]);
    } catch { /* ignore corrupt storage */ }
    setHydrated(true);
  }, []);

  // Persist completed messages. Skip while a reply is still streaming in so we
  // store the final text, not a half-revealed frame.
  useEffect(() => {
    if (!hydrated) return;
    if (messages.some((m) => m.streaming)) return;
    localStorage.setItem(MSGS_KEY, JSON.stringify(messages));
  }, [messages, hydrated]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // Reveal an agent message gradually to simulate streaming.
  function streamIn(full: string) {
    let shown = 0;
    setMessages((m) => [...m, { role: "agent", text: "", streaming: true }]);
    const timer = setInterval(() => {
      shown = Math.min(full.length, shown + REVEAL_CHARS);
      const done = shown >= full.length;
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "agent", text: full.slice(0, shown), streaming: !done };
        return next;
      });
      if (done) clearInterval(timer);
    }, REVEAL_MS);
  }

  function reset() {
    setMessages([]);
    setError(null);
    convId.current = undefined;
    localStorage.removeItem(CONV_KEY);
    localStorage.removeItem(MSGS_KEY);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId.current }),
      });
      const doc = await res.json();
      if (!res.ok) throw new Error(doc?.errors?.[0]?.detail ?? "Assistant error");
      convId.current = doc.conversationId;
      if (doc.conversationId) localStorage.setItem(CONV_KEY, doc.conversationId);
      for (const t of (doc.messages ?? []) as string[]) streamIn(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {messages.length > 0 && (
        <div className="flex justify-end border-b border-slate-100 px-3 py-1.5">
          <button
            onClick={reset}
            className="rounded-md px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            ↺ Reset conversation
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">
            Ask about picks, matchups, or your season plan.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "user" ? (
              <span className="inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl bg-emerald-600 px-3 py-2 text-sm text-white">
                {m.text}
              </span>
            ) : (
              <div className="inline-block max-w-[85%] rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                <div className="assistant-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
                {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-slate-400 align-middle" />}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-slate-400">Thinking…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div ref={bottom} />
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the assistant…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
