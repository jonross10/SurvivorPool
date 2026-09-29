"use client";
import { useState } from "react";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    const { error } = await signIn.magicLink({ email: email.trim(), callbackURL: "/" });
    setBusy(false);
    if (error) setError(error.message ?? "Couldn't send the link. Try again.");
    else setSent(true);
  }

  return (
    <main className="mx-auto flex h-full max-w-sm flex-col items-center justify-center gap-6 px-6">
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-md" />
        <span className="font-display text-2xl uppercase tracking-wide">
          Survivor<span className="text-accent">.</span>
        </span>
      </div>

      {sent ? (
        <p className="text-center text-sm text-muted">
          Check <span className="font-semibold text-fg">{email}</span> for a sign-in link.
          You can close this tab.
        </p>
      ) : (
        <>
          <p className="text-center text-sm text-muted">Sign in to track your entries.</p>
          <button
            onClick={() => signIn.social({ provider: "google", callbackURL: "/" })}
            className="btn-primary w-full"
          >
            Continue with Google
          </button>

          <div className="flex w-full items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={sendLink} className="flex w-full flex-col gap-3">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field w-full"
            />
            <button type="submit" disabled={busy} className="btn-ghost w-full">
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </form>
          {error && <p className="text-center text-sm text-danger">{error}</p>}
        </>
      )}
    </main>
  );
}
