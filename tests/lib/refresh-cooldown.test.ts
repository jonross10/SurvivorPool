import { describe, it, expect } from "vitest";
import { REFRESH_COOLDOWN_MS, cooldownRemainingMs } from "@/lib/refresh-cooldown";

describe("cooldownRemainingMs", () => {
  it("allows a refresh when no data has been fetched yet", () => {
    expect(cooldownRemainingMs(null, new Date())).toBe(0);
  });
  it("allows a refresh once the cooldown has fully elapsed", () => {
    const fetched = "2026-09-13T12:00:00Z";
    const now = new Date("2026-09-13T13:00:01Z"); // just past 1h
    expect(cooldownRemainingMs(fetched, now)).toBe(0);
  });
  it("reports remaining time within the cooldown window", () => {
    const fetched = "2026-09-13T12:00:00Z";
    const now = new Date("2026-09-13T12:20:00Z"); // 20 min in
    expect(cooldownRemainingMs(fetched, now)).toBe(REFRESH_COOLDOWN_MS - 20 * 60 * 1000);
  });
});
