"use client";
import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "agent"; text: string }

const STORAGE_KEY = "assistant_conversation_id";

export default function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const convId = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    convId.current = sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

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
      if (doc.conversationId) sessionStorage.setItem(STORAGE_KEY, doc.conversationId);
      setMessages((m) => [...m, ...(doc.messages ?? []).map((t: string) => ({ role: "agent" as const, text: t }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assistant error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-400">
            Ask about picks, matchups, or your season plan.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"
            }`}>{m.text}</span>
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
