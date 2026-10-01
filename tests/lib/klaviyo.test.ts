import { describe, it, expect } from "vitest";
import { extractAgentMessages, frameForRouting } from "@/lib/klaviyo";

describe("frameForRouting", () => {
  it("prepends a compact survivor-pool routing tag", () => {
    expect(frameForRouting("hey")).toBe("(NFL survivor pool) hey");
  });
  it("embeds the account id for the agent to pass to tools", () => {
    expect(frameForRouting("pick?", "user_123")).toBe("(NFL survivor pool · user=user_123) pick?");
  });
});

describe("extractAgentMessages", () => {
  it("returns agent message contents in order", () => {
    const events = [
      { type: "message", role: "user", content: "hi" },
      { type: "message", role: "agent", content: "Hello!" },
      { type: "message", role: "agent", content: "How can I help?" },
    ];
    expect(extractAgentMessages(events)).toEqual(["Hello!", "How can I help?"]);
  });

  it("ignores non-message events (handoff, error, tool) and non-agent roles", () => {
    const events = [
      { type: "handoff", mode: "soft" },
      { type: "message", role: "user", content: "hi" },
      { type: "error", message: "boom" },
      { type: "message", role: "agent", content: "Reply" },
    ];
    expect(extractAgentMessages(events)).toEqual(["Reply"]);
  });

  it("returns [] for empty or missing input", () => {
    expect(extractAgentMessages([])).toEqual([]);
    expect(extractAgentMessages(undefined)).toEqual([]);
  });
});
