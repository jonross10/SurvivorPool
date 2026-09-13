import { describe, it, expect } from "vitest";
import { unwrapMany, unwrapOne } from "@/lib/jsonapi-client";

describe("jsonapi client unwrap", () => {
  it("unwrapMany returns the attributes of each resource", () => {
    const doc = { data: [
      { type: "t", id: "1", attributes: { a: 1 } },
      { type: "t", id: "2", attributes: { a: 2 } },
    ] };
    expect(unwrapMany(doc)).toEqual([{ a: 1 }, { a: 2 }]);
  });
  it("unwrapMany tolerates a missing data array", () => {
    expect(unwrapMany({} as any)).toEqual([]);
  });
  it("unwrapOne returns a single resource's attributes", () => {
    expect(unwrapOne({ data: { type: "t", id: "1", attributes: { a: 9 } } })).toEqual({ a: 9 });
  });
});
