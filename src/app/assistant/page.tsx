import AssistantChat from "@/components/AssistantChat";

export default function AssistantPage() {
  return (
    <main className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-6">
      <h1 className="mb-3 text-2xl font-bold tracking-tight">Assistant</h1>
      <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <AssistantChat />
      </div>
    </main>
  );
}
