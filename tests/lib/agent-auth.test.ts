import { describe, it, expect, afterEach, vi } from "vitest";

// Mock the session helper so agent-auth does not transitively load the real auth
// module (which would construct a DB Pool at import time).
vi.mock("@/lib/session", () => ({ getSessionUserId: vi.fn() }));

import { requireAgentWrite, resolveActorUserId } from "@/lib/agent-auth";
import { getSessionUserId } from "@/lib/session";

const mockSession = getSessionUserId as unknown as ReturnType<typeof vi.fn>;

const orig = process.env.AGENT_WRITE_TOKEN;
afterEach(() => { process.env.AGENT_WRITE_TOKEN = orig; });

function req(auth?: string): Request {
  return new Request("http://x/api/picks", { method: "POST", headers: auth ? { authorization: auth } : {} });
}

describe("requireAgentWrite", () => {
  it("allows any request when no token is configured", () => {
    delete process.env.AGENT_WRITE_TOKEN;
    expect(requireAgentWrite(req())).toBeNull();
    expect(requireAgentWrite(req("Bearer whatever"))).toBeNull();
  });

  it("allows a request with the correct bearer token", () => {
    process.env.AGENT_WRITE_TOKEN = "secret123";
    expect(requireAgentWrite(req("Bearer secret123"))).toBeNull();
  });

  it("rejects missing or wrong token when configured", () => {
    process.env.AGENT_WRITE_TOKEN = "secret123";
    const missing = requireAgentWrite(req());
    const wrong = requireAgentWrite(req("Bearer nope"));
    expect(missing?.status).toBe(401);
    expect(wrong?.status).toBe(401);
  });
});

function actorReq(headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/picks", { method: "POST", headers });
}

describe("resolveActorUserId", () => {
  it("returns the session user when logged in", async () => {
    mockSession.mockResolvedValue("user_session");
    expect(await resolveActorUserId(actorReq())).toBe("user_session");
  });

  it("returns the on-behalf-of id when the agent token is valid", async () => {
    mockSession.mockResolvedValue(null);
    process.env.AGENT_WRITE_TOKEN = "secret123";
    const r = actorReq({ authorization: "Bearer secret123", "x-on-behalf-of": "user_target" });
    expect(await resolveActorUserId(r)).toBe("user_target");
  });

  it("rejects on-behalf-of without a valid agent token", async () => {
    mockSession.mockResolvedValue(null);
    process.env.AGENT_WRITE_TOKEN = "secret123";
    const r = actorReq({ authorization: "Bearer wrong", "x-on-behalf-of": "user_target" });
    expect(await resolveActorUserId(r)).toBeNull();
  });

  it("returns null when neither session nor agent token is present", async () => {
    mockSession.mockResolvedValue(null);
    delete process.env.AGENT_WRITE_TOKEN;
    expect(await resolveActorUserId(actorReq())).toBeNull();
  });
});
