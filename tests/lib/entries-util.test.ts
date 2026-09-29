import { describe, it, expect } from "vitest";
import {
  validateEntryName, nameToId, EmptyNameError,
  normalizeSettings, validateSettings,
} from "@/lib/entries-util";

describe("normalizeSettings", () => {
  it("coerces string values from agent tool templates", () => {
    expect(normalizeSettings({ ties_survive: "true", min_win_chance: "0.7", pool: "  Test  " }))
      .toEqual({ ties_survive: true, min_win_chance: 0.7, pool: "Test" });
    expect(normalizeSettings({ ties_survive: "false" })).toEqual({ ties_survive: false });
  });
  it("drops blank/absent values instead of storing them", () => {
    expect(normalizeSettings({ pool: "   ", min_win_chance: "" })).toEqual({});
    expect(normalizeSettings({})).toEqual({});
  });
  it("drops unrendered template tokens from optional agent variables", () => {
    expect(normalizeSettings({ pool: "{{pool}}", ties_survive: "{{ties_survive}}", min_win_chance: "{{min_win_chance}}" }))
      .toEqual({});
  });
  it("passes through already-typed values", () => {
    expect(normalizeSettings({ ties_survive: false, min_win_chance: 0.5, pool: "main" }))
      .toEqual({ ties_survive: false, min_win_chance: 0.5, pool: "main" });
  });
  it("passes pick_due null and objects through", () => {
    expect(normalizeSettings({ pick_due: null })).toEqual({ pick_due: null });
    expect(normalizeSettings({ pick_due: { day: 0, time: "13:00" } }))
      .toEqual({ pick_due: { day: 0, time: "13:00" } });
  });
});

describe("validateSettings", () => {
  it("returns null for valid settings", () => {
    expect(validateSettings({ ties_survive: true, pool: "main", min_win_chance: 0.6 })).toBeNull();
    expect(validateSettings({})).toBeNull();
  });
  it("rejects a non-boolean ties_survive", () => {
    expect(validateSettings({ ties_survive: "yes" as unknown as boolean })).toMatch(/ties_survive/);
  });
  it("rejects an empty pool", () => {
    expect(validateSettings({ pool: "" })).toMatch(/pool/);
  });
  it("rejects min_win_chance out of range", () => {
    expect(validateSettings({ min_win_chance: 1.5 })).toMatch(/min_win_chance/);
    expect(validateSettings({ min_win_chance: -0.1 })).toMatch(/min_win_chance/);
  });
  it("rejects a malformed pick_due", () => {
    expect(validateSettings({ pick_due: { day: 9, time: "13:00" } })).toMatch(/pick_due/);
    expect(validateSettings({ pick_due: { day: 0, time: "25:00" } })).toMatch(/pick_due/);
  });
});

describe("validateEntryName", () => {
  it("trims and returns a valid name", () => {
    expect(validateEntryName("  Sarah  ")).toBe("Sarah");
  });
  it("throws EmptyNameError on blank input", () => {
    expect(() => validateEntryName("   ")).toThrow(EmptyNameError);
    expect(() => validateEntryName("")).toThrow(EmptyNameError);
  });
});

describe("nameToId", () => {
  it("maps entry names to ids", () => {
    const map = nameToId([{ id: "a1", name: "Jon", settings: {}, ownerId: "u1" }, { id: "b2", name: "Sarah", settings: {}, ownerId: "u1" }]);
    expect(map).toEqual({ Jon: "a1", Sarah: "b2" });
  });
});
