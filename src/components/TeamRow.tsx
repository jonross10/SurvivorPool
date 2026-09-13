import TeamLogo from "./TeamLogo";

export default function TeamRow({
  abbr,
  size = 24,
  rank,
}: {
  abbr: string;
  size?: number;
  rank?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <TeamLogo abbr={abbr} size={size} />
      <span className="font-semibold">{abbr}</span>
      {rank !== undefined && (
        <span className="text-[10px] font-medium text-slate-400" title="Power ranking">
          #{rank}
        </span>
      )}
    </span>
  );
}
