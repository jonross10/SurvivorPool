import type { TeamAbbr } from "./types";

// Our canonical abbr → ESPN logo slug (mostly identity lowercased).
const ESPN_SLUG: Record<string, string> = { JAC: "jax", WAS: "wsh" };

export function espnLogoAbbr(abbr: TeamAbbr): string {
  return ESPN_SLUG[abbr] ?? abbr.toLowerCase();
}

export function teamLogoUrl(abbr: TeamAbbr): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnLogoAbbr(abbr)}.png`;
}

const COLORS: Record<string, string> = {
  ARI: "#97233F", ATL: "#A71930", BAL: "#241773", BUF: "#00338D", CAR: "#0085CA",
  CHI: "#0B162A", CIN: "#FB4F14", CLE: "#311D00", DAL: "#041E42", DEN: "#FB4F14",
  DET: "#0076B6", GB: "#203731", HOU: "#03202F", IND: "#002C5F", JAC: "#101820",
  KC: "#E31837", LV: "#000000", LAC: "#0080C6", LAR: "#003594", MIA: "#008E97",
  MIN: "#4F2683", NE: "#002244", NO: "#D3BC8D", NYG: "#0B2265", NYJ: "#125740",
  PHI: "#004C54", PIT: "#FFB612", SF: "#AA0000", SEA: "#002244", TB: "#D50A0A",
  TEN: "#0C2340", WAS: "#5A1414",
};

export function teamColor(abbr: TeamAbbr): string {
  return COLORS[abbr] ?? "#334155"; // slate-700 fallback
}
