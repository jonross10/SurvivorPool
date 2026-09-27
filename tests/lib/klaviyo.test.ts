import { describe, it, expect } from "vitest";
import { extractAgentMessages } from "@/lib/klaviyo";

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
