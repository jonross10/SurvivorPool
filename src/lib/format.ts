/** Display formatters shared across the UI. */

/** A point spread from a team's perspective: "-3.5", "+7", "PK", or "" when unknown. */
export function fmtSpread(s: number | null): string {
  if (s === null) return "";
  if (s === 0) return "PK";
  return s > 0 ? `+${s}` : `${s}`;
}

/** American moneyline odds: "+120", "-150", or "" when unknown. */
export function fmtOdds(o: number | null): string {
  if (o === null) return "";
  return o > 0 ? `+${o}` : `${o}`;
}

/** Kickoff as a short weekday + time, e.g. "Sun 1:00 PM". */
export function fmtKick(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
