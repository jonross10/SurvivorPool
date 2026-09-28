"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import AssistantChat from "./AssistantChat";

export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // The dedicated /assistant page already renders the chat full-width.
  if (pathname === "/assistant") return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open assistant"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-xl text-accent-fg shadow-glow hover:opacity-90"
      >
        💬
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-lg uppercase tracking-wide text-fg">Assistant</h2>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-fg">✕</button>
            </div>
            <AssistantChat />
          </div>
        </div>
      )}
    </>
  );
}
