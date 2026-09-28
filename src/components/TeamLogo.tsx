"use client";
import { useState } from "react";
import { teamLogoUrl } from "@/lib/team-visuals";

export default function TeamLogo({ abbr, size = 28 }: { abbr: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-muted"
      >
        {abbr}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={teamLogoUrl(abbr)}
      alt={abbr}
      width={size}
      height={size}
      onError={() => setBroken(true)}
      className="inline-block object-contain"
    />
  );
}
