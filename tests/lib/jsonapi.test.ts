import { describe, it, expect } from "vitest";
import {
  resource, document, metaDocument, errorDocument, jsonApi, getFilter,
} from "@/lib/jsonapi";

describe("jsonapi helpers", () => {
  it("builds a resource object", () => {
    expect(resource("game", "1:NYJ@BUF", { week: 1 })).toEqual({
      type: "game", id: "1:NYJ@BUF", attributes: { week: 1 },
    });
  });
  it("wraps data with optional meta", () => {
    expect(document([{ type: "t", id: "1", attributes: {} }])).toEqual({
      data: [{ type: "t", id: "1", attributes: {} }],
    });
    expect(document({ type: "t", id: "1", attributes: {} }, { currentWeek: 2 })).toEqual({
      data: { type: "t", id: "1", attributes: {} }, meta: { currentWeek: 2 },
    });
  });
  it("builds meta-only and error documents", () => {
    expect(metaDocument({ ok: true })).toEqual({ meta: { ok: true } });
    expect(errorDocument([{ status: "409", title: "Conflict" }])).toEqual({
      errors: [{ status: "409", title: "Conflict" }],
    });
  });
  it("getFilter reads the filter[key] query param", () => {
    const req = new Request("http://x/api/matchups?filter%5Bweek%5D=3");
    expect(getFilter(req, "week")).toBe("3");
    expect(getFilter(new Request("http://x/api/matchups"), "week")).toBeNull();
  });
  it("jsonApi sets status and the JSON:API content type", async () => {
    const res = jsonApi(metaDocument({ ok: true }), 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toBe("application/vnd.api+json");
    expect(await res.json()).toEqual({ meta: { ok: true } });
  });
});
