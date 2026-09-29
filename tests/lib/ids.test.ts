import { describe, it, expect } from "vitest";
import { newId } from "@/lib/ids";

describe("newId", () => {
  it("returns a 26-char Crockford base32 ULID", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is monotonically sortable by creation time", () => {
    const a = newId();
    const b = newId();
    expect(a <= b).toBe(true);
  });
});
