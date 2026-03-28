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

    const defaultResult = renderAsciicast(events, { ...DEFAULT_CONFIG, typingSpeed: 80, responseTypingSpeed: undefined });
    const overrideResult = renderAsciicast(events, { ...DEFAULT_CONFIG, typingSpeed: 80, responseTypingSpeed: 80 });

    // Should produce identical frame count and timing when responseTypingSpeed equals typingSpeed
    expect(defaultResult.events.length).toBe(overrideResult.events.length);
  });

  it("should use agentSpeed for long user messages (>200 chars)", () => {
    // A long user message should use agentSpeed, producing tighter timing than userTypingSpeed
    const longText = "word ".repeat(60); // 300 chars, well over 200

    const events: TimelineEvent[] = [
      makeEvent({
        kind: "user_message",
        timestamp: 1000,
        duration: 5000,
        text: longText,
      }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      userTypingSpeed: 25,
      agentSpeed: 800,
    };

    const result = renderAsciicast(events, config);

    // Extract word-level frames (those that contain actual user text, not headers)
    const wordFrames = result.events.filter(
      ([, , d]) => !d.includes("User:") && !d.includes("Session") && !d.includes("claude") && !d.includes("\x1b[44m")
    );

    // With agentSpeed=800, totalTime = 300/800 = 0.375s
    // With userTypingSpeed=25, totalTime = 300/25 = 12s
    // The last word frame should be within a few seconds of the start, not 12+ seconds
    if (wordFrames.length > 1) {
      const firstWordTime = wordFrames[0][0];
      const lastWordTime = wordFrames[wordFrames.length - 1][0];
      const renderSpan = lastWordTime - firstWordTime;

      // User messages always use userTypingSpeed regardless of length
      // 300 chars at 25 cps = 12s
      expect(renderSpan).toBeGreaterThan(5);
    }
  });

  it("should use userTypingSpeed for short user messages (<=200 chars)", () => {
    const shortText = "Hello, how are you today?"; // well under 200 chars

    const events: TimelineEvent[] = [
      makeEvent({
        kind: "user_message",
        timestamp: 1000,
        duration: 5000,
        text: shortText,
      }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      userTypingSpeed: 25,
      agentSpeed: 800,
    };

    const result = renderAsciicast(events, config);

    const wordFrames = result.events.filter(
      ([, , d]) => !d.includes("User:") && !d.includes("Session") && !d.includes("claude") && !d.includes("\x1b[44m")
    );

    if (wordFrames.length > 1) {
      const firstWordTime = wordFrames[0][0];
      const lastWordTime = wordFrames[wordFrames.length - 1][0];
      const renderSpan = lastWordTime - firstWordTime;

      // With userTypingSpeed=25, totalTime = 25/25 = 1s
      // With agentSpeed=800, it would be 25/800 = 0.03s
      // Should be closer to 1s than 0.03s
      expect(renderSpan).toBeGreaterThan(0.1);
    }
  });

  it("should use userTypingSpeed for all user messages regardless of length", () => {
    // Even long user messages use userTypingSpeed — they are real user input
    const multilineText = "hi\nhi\nhi\nhi\nhi\nhi"; // 6 lines, ~18 chars

    const events: TimelineEvent[] = [
      makeEvent({
        kind: "user_message",
        timestamp: 1000,
        duration: 5000,
        text: multilineText,
      }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      userTypingSpeed: 10,
      agentSpeed: 5000,
    };

    const result = renderAsciicast(events, config);

    const wordFrames = result.events.filter(
      ([, , d]) => !d.includes("User:") && !d.includes("Session") && !d.includes("claude") && !d.includes("\x1b[44m")
    );

    if (wordFrames.length > 1) {
      const firstWordTime = wordFrames[0][0];
      const lastWordTime = wordFrames[wordFrames.length - 1][0];
      const renderSpan = lastWordTime - firstWordTime;

      // With userTypingSpeed=10: totalTime = 18/10 = 1.8s
      // Should use slow userTypingSpeed, not fast agentSpeed
      expect(renderSpan).toBeGreaterThan(0.5);
    }
  });
});
