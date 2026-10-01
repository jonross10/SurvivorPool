// Module-level store for the assistant conversation. Lives OUTSIDE the React component so
// the request/reply lifecycle survives navigation: if you send a message and tab away, the
// /assistant page unmounts, but this module keeps running — the reply lands here and is
// persisted to localStorage, so it's there (mid-conversation or on return). The component
// subscribes via useSyncExternalStore and is a pure view over this state.

export interface Msg { role: "user" | "agent"; text: string }
export interface AssistantState { messages: Msg[]; busy: boolean; error: string | null }

const CONV_KEY = "assistant_conversation_id";
const MSGS_KEY = "assistant_messages";

let messages: Msg[] = [];
let busy = false;
let error: string | null = null;
let convId: string | undefined;
let loaded = false;

// useSyncExternalStore requires getSnapshot to return a referentially-stable value until
// something actually changes, so we cache a snapshot object and only rebuild it on emit().
let snapshot: AssistantState = { messages, busy, error };
const EMPTY: AssistantState = { messages: [], busy: false, error: null };

const listeners = new Set<() => void>();

function emit() {
  snapshot = { messages, busy, error };
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(MSGS_KEY, JSON.stringify(messages));
    if (convId) localStorage.setItem(CONV_KEY, convId);
  } catch { /* storage full / unavailable — non-fatal */ }
}

/** Hydrate once from localStorage (lazily, on first subscribe/read). */
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    convId = localStorage.getItem(CONV_KEY) ?? undefined;
    const saved = localStorage.getItem(MSGS_KEY);
    if (saved) messages = JSON.parse(saved) as Msg[];
  } catch { /* ignore corrupt storage */ }
  snapshot = { messages, busy, error };
}

export function subscribe(cb: () => void): () => void {
  ensureLoaded();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getSnapshot(): AssistantState {
  ensureLoaded();
  return snapshot;
}

export function getServerSnapshot(): AssistantState {
  return EMPTY;
}

/** Send a user message and fetch the agent's reply. Safe to fire-and-forget. */
export async function send(text: string): Promise<void> {
  ensureLoaded();
  const trimmed = text.trim();
  if (!trimmed || busy) return;

  messages = [...messages, { role: "user", text: trimmed }];
  busy = true;
  error = null;
  persist();
  emit();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: trimmed, conversationId: convId }),
    });
    const doc = await res.json();
    if (!res.ok) throw new Error(doc?.errors?.[0]?.detail ?? "Assistant error");
    convId = doc.conversationId ?? convId;
    const replies = (doc.messages ?? []) as string[];
    messages = [...messages, ...replies.map((t) => ({ role: "agent" as const, text: t }))];
  } catch (e) {
    error = e instanceof Error ? e.message : "Assistant error";
  } finally {
    busy = false;
    persist();
    emit();
  }
}

export function reset(): void {
  messages = [];
  error = null;
  convId = undefined;
  // Leave `busy` as-is: if a request is in flight its reply will still resolve into the
  // (now empty) conversation, which is the least-surprising behavior.
  try {
    localStorage.removeItem(CONV_KEY);
    localStorage.removeItem(MSGS_KEY);
  } catch { /* non-fatal */ }
  emit();
}
