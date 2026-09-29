import { describe, it, expect, vi, beforeEach } from "vitest";

// Record the SQL template strings + interpolated values so we can assert scoping.
const calls: string[] = [];
vi.mock("@/lib/db/client", () => ({
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => {
    calls.push(strings.join("?") + " :: " + JSON.stringify(vals));
    return Promise.resolve([]);
  },
}));

import { getEntries, getEntryOwner } from "@/lib/db/entries-repo";

beforeEach(() => { calls.length = 0; });

describe("getEntries", () => {
  it("filters by owner_id and passes the owner as a value", async () => {
    await getEntries("user_abc");
    expect(calls[0]).toContain("owner_id");
    expect(calls[0]).toContain("user_abc");
  });
});

describe("getEntryOwner", () => {
  it("queries by entry id", async () => {
    await getEntryOwner("entry_1");
    expect(calls[0]).toContain("owner_id");
    expect(calls[0]).toContain("entry_1");
  });
});
