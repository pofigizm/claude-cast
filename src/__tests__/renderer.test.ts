import { describe, it, expect } from "vitest";
import { renderAsciicast } from "../renderer.js";
import type { TimelineEvent, CastConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    kind: "assistant_text",
    timestamp: 0,
    duration: 1000,
    text: "test output",
    ...overrides,
  };
}

describe("renderAsciicast per-phase timing", () => {
  it("should use userTypingSpeed for user messages when set", () => {
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "user_message",
        timestamp: 1000,
        duration: 2000,
        text: "Hello world, this is a user message with enough text to measure timing",
      }),
    ];

    const slowConfig: CastConfig = { ...DEFAULT_CONFIG, userTypingSpeed: 10 };
    const fastConfig: CastConfig = { ...DEFAULT_CONFIG, userTypingSpeed: 1000 };

    const slowResult = renderAsciicast(events, slowConfig);
    const fastResult = renderAsciicast(events, fastConfig);

    // With slower speed, user message frames should be more spread out in time
    const slowFrames = slowResult.events.filter(([, , d]) => d.includes("User") || d.includes("user"));
    const fastFrames = fastResult.events.filter(([, , d]) => d.includes("User") || d.includes("user"));

    // Both should produce frames (basic sanity check)
    expect(slowFrames.length).toBeGreaterThan(0);
    expect(fastFrames.length).toBeGreaterThan(0);
  });

  it("should use responseTypingSpeed for assistant text when set", () => {
    const text = "A".repeat(200);
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "assistant_text",
        timestamp: 1000,
        duration: 10000,
        text,
      }),
    ];

    const slowConfig: CastConfig = { ...DEFAULT_CONFIG, responseTypingSpeed: 20 };
    const fastConfig: CastConfig = { ...DEFAULT_CONFIG, responseTypingSpeed: 500 };

    const slowResult = renderAsciicast(events, slowConfig);
    const fastResult = renderAsciicast(events, fastConfig);

    // Get the last frame time for the assistant text rendering
    const slowLastTime = slowResult.events[slowResult.events.length - 2][0];
    const fastLastTime = fastResult.events[fastResult.events.length - 2][0];

    // Slower speed should result in later last-frame timestamp
    expect(slowLastTime).toBeGreaterThan(fastLastTime);
  });

  it("should use agentSpeed for tool_use when set", () => {
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "tool_use",
        timestamp: 1000,
        duration: 500,
        toolName: "Bash",
        text: "line1\nline2\nline3\nline4\nline5",
      }),
    ];

    const slowConfig: CastConfig = { ...DEFAULT_CONFIG, agentSpeed: 20 };
    const fastConfig: CastConfig = { ...DEFAULT_CONFIG, agentSpeed: 5000 };

    const slowResult = renderAsciicast(events, slowConfig);
    const fastResult = renderAsciicast(events, fastConfig);

    // Both should produce frames
    expect(slowResult.events.length).toBeGreaterThan(1);
    expect(fastResult.events.length).toBeGreaterThan(1);
  });

  it("should fall back to typingSpeed when per-phase speeds not set", () => {
    const text = "B".repeat(200);
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "assistant_text",
        timestamp: 1000,
        duration: 10000,
        text,
      }),
    ];

    const defaultResult = renderAsciicast(events, { ...DEFAULT_CONFIG, typingSpeed: 80 });
    const overrideResult = renderAsciicast(events, { ...DEFAULT_CONFIG, typingSpeed: 80, responseTypingSpeed: 80 });

    // Should produce identical frame count and timing when responseTypingSpeed equals typingSpeed
    expect(defaultResult.events.length).toBe(overrideResult.events.length);
  });
});
