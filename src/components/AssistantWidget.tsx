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
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-xl text-white shadow-lg hover:bg-emerald-700"
      >
        💬
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold">Assistant</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <AssistantChat />
          </div>
        </div>
      )}
    </>
  );
}
