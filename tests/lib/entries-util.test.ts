import { describe, it, expect } from "vitest";
import { validateEntryName, nameToId, EmptyNameError } from "@/lib/entries-util";

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
    const map = nameToId([{ id: "a1", name: "Jon" }, { id: "b2", name: "Sarah" }]);
    expect(map).toEqual({ Jon: "a1", Sarah: "b2" });
  });
});
