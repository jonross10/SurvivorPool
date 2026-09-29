import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the session helper so agent-auth does not transitively load the real auth
// module (which would construct a DB Pool at import time). Also mock the user lookup.
vi.mock("@/lib/session", () => ({ getSessionUserId: vi.fn() }));
vi.mock("@/lib/db/users-repo", () => ({ getUserIdByEmail: vi.fn() }));

import { resolveActorUserId } from "@/lib/agent-auth";
import { getSessionUserId } from "@/lib/session";
import { getUserIdByEmail } from "@/lib/db/users-repo";

const mockSession = getSessionUserId as unknown as ReturnType<typeof vi.fn>;
const mockUserByEmail = getUserIdByEmail as unknown as ReturnType<typeof vi.fn>;

const orig = process.env.API_KEY;
afterEach(() => { process.env.API_KEY = orig; });

function req(headers: Record<string, string> = {}, userId?: string): Request {
  const url = userId ? `http://x/api/picks?userId=${userId}` : "http://x/api/picks";
  return new Request(url, { method: "POST", headers });
}

function emailReq(headers: Record<string, string>, email: string): Request {
  return new Request(`http://x/api/picks?email=${encodeURIComponent(email)}`, { method: "POST", headers });
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

  it("maps the email query param to a user id when the API key is valid", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    mockUserByEmail.mockResolvedValue("user_from_email");
    const r = emailReq({ "x-api-key": "secret123" }, "jon@example.com");
    expect(await resolveActorUserId(r)).toBe("user_from_email");
    expect(mockUserByEmail).toHaveBeenCalledWith("jon@example.com");
  });

  it("returns null when the email has no matching user", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    mockUserByEmail.mockResolvedValue(null);
    expect(await resolveActorUserId(emailReq({ "x-api-key": "secret123" }, "nope@example.com"))).toBeNull();
  });

  it("does not map email without a valid API key", async () => {
    mockSession.mockResolvedValue(null);
    process.env.API_KEY = "secret123";
    const r = emailReq({ "x-api-key": "wrong" }, "jon@example.com");
    expect(await resolveActorUserId(r)).toBeNull();
    expect(mockUserByEmail).not.toHaveBeenCalled();
  });

  it("returns null when neither session nor API key authenticates", async () => {
    mockSession.mockResolvedValue(null);
    delete process.env.API_KEY;
    expect(await resolveActorUserId(req({}, "user_target"))).toBeNull();
  });
});
