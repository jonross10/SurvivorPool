import { describe, it, expect } from "vitest";
import { extractAgentMessages, frameForRouting, stripFraming } from "@/lib/klaviyo";

describe("frameForRouting", () => {
  it("prepends a compact survivor-pool routing tag", () => {
    expect(frameForRouting("hey")).toBe("(NFL survivor pool) hey");
  });
  it("embeds the account id for the agent to pass to tools", () => {
    expect(frameForRouting("pick?", "user_123")).toBe("(NFL survivor pool · user=user_123) pick?");
  });
});

describe("stripFraming", () => {
  it("strips the current user-framed prefix (round-trips frameForRouting)", () => {
    expect(stripFraming(frameForRouting("Who should I pick?", "user_123"))).toBe("Who should I pick?");
  });
  it("strips the no-user prefix", () => {
    expect(stripFraming("(NFL survivor pool) hey")).toBe("hey");
  });
  it("strips the old verbose framing (no inner parens)", () => {
    const old =
      "(NFL survivor pool assistant — the shopper is already authenticated by the host app; " +
      "their account id is abc123; never ask them to log in, and pass this account id to all tool calls.) " +
      "Who should I pick this week";
    expect(stripFraming(old)).toBe("Who should I pick this week");
  });
  it("leaves an unframed message untouched", () => {
    expect(stripFraming("just a normal question")).toBe("just a normal question");
  });
  it("does not strip a user message that merely starts with an unrelated parenthetical", () => {
    expect(stripFraming("(btw) hi")).toBe("(btw) hi");
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
