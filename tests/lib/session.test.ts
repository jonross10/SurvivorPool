import { describe, it, expect, vi } from "vitest";

// Mock the auth module so importing session.ts does not construct a real DB Pool.
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

import { getSessionUserId } from "@/lib/session";
import { auth } from "@/lib/auth";

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;

describe("getSessionUserId", () => {
  it("returns the user id when a session exists", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user_123" } });
    const req = new Request("http://localhost/x");
    expect(await getSessionUserId(req)).toBe("user_123");
  });

  it("returns null when there is no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const req = new Request("http://localhost/x");
    expect(await getSessionUserId(req)).toBeNull();
  });
});
