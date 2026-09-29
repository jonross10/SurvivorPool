"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession, signOut } from "@/lib/auth-client";

type NavLink = {
  href: string;
  label: string; // desktop pill label
  short: string; // bottom-tab label
  icon: ReactNode;
};

// Inline 22px stroke icons (match public/nav-mockups.html variant C).
const ic = "h-[22px] w-[22px]";
const LINKS: NavLink[] = [
  {
    href: "/",
    label: "Dashboard",
    short: "Home",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M3 12l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    ),
  },
  {
    href: "/matchups",
    label: "Matchups",
    short: "Matchups",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M12 5v14" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "Calendar",
    short: "Calendar",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </svg>
    ),
  },
  {
    href: "/plan",
    label: "Plan",
    short: "Plan",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: "/grid",
    label: "Grid",
    short: "Grid",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/assistant",
    label: "Assistant",
    short: "Chat",
    icon: (
      <svg className={ic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    ),
  },
];

function useIsActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

/** Top brand bar. Brand always; scrollable pills on desktop only. Flex sibling (not sticky). */
export function TopNav() {
  const isActive = useIsActive();
  const { data: session } = useSession();
  const path = usePathname();
  if (path === "/signin") return null;

  return (
    <nav className="shrink-0 border-b border-line bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto max-w-4xl px-3">
        <div className="flex items-center justify-between py-2.5">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="font-display text-lg uppercase tracking-wide">
              Survivor<span className="text-accent">.</span>
            </span>
          </Link>
          {session?.user && (
            <button
              onClick={() => signOut()}
              className="ml-auto flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
              aria-label="Sign out"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-fg">
                {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
              </span>
              Sign out
            </button>
          )}
        </div>
        {/* Desktop: horizontally scrollable pills. Hidden on mobile (bottom bar there). */}
        <div className="-mx-3 hidden gap-1.5 overflow-x-auto px-3 pb-2 md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={`pill ${isActive(l.href) ? "pill-active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

/** Bottom tab bar. Mobile only. Flex sibling at the bottom of the app shell. */
export function BottomNav() {
  const isActive = useIsActive();
  const path = usePathname();
  if (path === "/signin") return null;

  return (
    <nav className="shrink-0 border-t border-line bg-surface/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-stretch justify-around gap-0.5 px-0.5 pt-1.5 pb-1.5">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`tab ${isActive(l.href) ? "tab-active" : ""}`}>
            {l.icon}
            <span>{l.short}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
