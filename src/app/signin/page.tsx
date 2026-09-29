"use client";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-6">
      <div className="flex items-center gap-2">
        <Image src="/logo.png" alt="" width={32} height={32} className="rounded-md" />
        <span className="font-display text-2xl uppercase tracking-wide">
          Survivor<span className="text-accent">.</span>
        </span>
      </div>
      <p className="text-center text-sm text-muted">Sign in to track your entries.</p>
      <button
        onClick={() => signIn.social({ provider: "google", callbackURL: "/" })}
        className="btn-primary w-full"
      >
        Continue with Google
      </button>
    </main>
  );
}
