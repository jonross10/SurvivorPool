export default function WinProbPill({ prob }: { prob: number }) {
  const hue = Math.round(prob * 120); // 0=red → 120=green
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{
        background: `hsl(${hue}, 78%, 91%)`,
        color: `hsl(${hue}, 65%, 28%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue}, 55%, 80%)`,
      }}
    >
      {Math.round(prob * 100)}%
    </span>
  );
}
