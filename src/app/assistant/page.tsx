import AssistantChat from "@/components/AssistantChat";

export default function AssistantPage() {
  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col px-3 py-4">
      <h1 className="mb-3 font-display text-3xl uppercase tracking-wide">Assistant</h1>
      <div className="flex-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <AssistantChat />
      </div>
    </main>
  );
}
