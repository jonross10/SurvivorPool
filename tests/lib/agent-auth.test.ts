import { describe, it, expect, afterEach } from "vitest";
import { requireAgentWrite } from "@/lib/agent-auth";

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
