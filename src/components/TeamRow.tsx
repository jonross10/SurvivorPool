import TeamLogo from "./TeamLogo";

export default function TeamRow({ abbr, size = 24 }: { abbr: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <TeamLogo abbr={abbr} size={size} />
      <span className="font-semibold">{abbr}</span>
    </span>
  );
}
