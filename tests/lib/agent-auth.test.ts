import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the session helper so agent-auth does not transitively load the real auth
// module (which would construct a DB Pool at import time).
vi.mock("@/lib/session", () => ({ getSessionUserId: vi.fn() }));

import { resolveActorUserId } from "@/lib/agent-auth";
import { getSessionUserId } from "@/lib/session";

const mockSession = getSessionUserId as unknown as ReturnType<typeof vi.fn>;

const orig = process.env.API_KEY;
afterEach(() => { process.env.API_KEY = orig; });

function req(headers: Record<string, string> = {}, userId?: string): Request {
  const url = userId ? `http://x/api/picks?userId=${userId}` : "http://x/api/picks";
  return new Request(url, { method: "POST", headers });
}

describe("resolveActorUserId", () => {
  it("returns the session user when logged in (ignores any userId param)", async () => {
    mockSession.mockResolvedValue("user_session");
    process.env.API_KEY = "secret123";
    // Even with a valid key + a different userId, the session wins.
    const r = req({ "x-api-key": "secret123" }, "someone_else");
    expect(await resolveActorUserId(r)).toBe("user_session");
  });

  it("returns the userId query param when the API key is valid", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    expect(await resolveActorUserId(req({ "x-api-key": "secret123" }, "user_target"))).toBe("user_target");
  });

  it("returns null when the API key is valid but no userId is supplied", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    expect(await resolveActorUserId(req({ "x-api-key": "secret123" }))).toBeNull();
  });

  it("rejects a userId when the API key is wrong", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    expect(await resolveActorUserId(req({ "x-api-key": "nope" }, "user_target"))).toBeNull();
  });

  it("returns null when neither session nor API key authenticates", async () => {
    mockSession.mockResolvedValue(null);
    delete process.env.API_KEY;
    expect(await resolveActorUserId(req({}, "user_target"))).toBeNull();
  });
});
