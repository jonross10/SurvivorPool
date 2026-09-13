export default function WinProbPill({ prob }: { prob: number }) {
  const hue = Math.round(prob * 120); // 0=red → 120=green
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-slate-900"
      style={{ background: `hsl(${hue}, 75%, 85%)` }}
    >
      {Math.round(prob * 100)}%
    </span>
  );
}
