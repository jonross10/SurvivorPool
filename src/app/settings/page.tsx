"use client";
import { useSession, signOut } from "@/lib/auth-client";
import PushToggle from "@/components/PushToggle";

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const initial = (user?.name ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-5 font-display text-3xl uppercase tracking-wide">Settings</h1>

      <section className="card mb-4 p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">Account</div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-fg">
            {initial}
          </span>
          <div className="min-w-0">
            {user?.name && <div className="truncate font-semibold text-fg">{user.name}</div>}
            <div className="truncate text-sm text-muted">{user?.email ?? "—"}</div>
          </div>
        </div>
      </section>

      <section className="card mb-4 p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">Notifications</div>
        <PushToggle />
      </section>

      <button onClick={() => signOut()} className="btn-ghost w-full">
        Sign out
      </button>
    </main>
  );
}
