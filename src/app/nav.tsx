"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/matchups", label: "Matchups" },
  { href: "/calendar", label: "Calendar" },
  { href: "/plan", label: "Plan" },
  { href: "/grid", label: "Grid" },
  { href: "/assistant", label: "Assistant" },
];

export default function Nav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto max-w-4xl px-3">
        <div className="flex items-center justify-between py-2.5">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <Image src="/logo.png" alt="" width={26} height={26} className="rounded-md" />
            <span className="font-display text-lg uppercase tracking-wide">
              Survivor<span className="text-accent">.</span>
            </span>
          </Link>
        </div>
        {/* Horizontally scrollable pill nav — thumb-friendly on phones. */}
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href} className={`pill ${active ? "pill-active" : ""}`}>
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
