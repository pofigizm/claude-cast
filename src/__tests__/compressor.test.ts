import { describe, it, expect } from "vitest";
import { compressTimeline } from "../compressor.js";
import type { TimelineEvent, CastConfig } from "../types.js";
import { DEFAULT_CONFIG } from "../types.js";

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    kind: "assistant_text",
    timestamp: 0,
    duration: 1000,
    text: "test",
    ...overrides,
  };
}

describe("compressTimeline", () => {
  it("should cap long pauses to maxPause", () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 0, duration: 30000 }), // 30s pause
      makeEvent({ timestamp: 30000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3 };
    const result = compressTimeline(events, config);

    // First event duration should be capped to 3s = 3000ms / speed
    expect(result[0].duration).toBeLessThanOrEqual(3000);
  });

  it("should not modify short pauses", () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 0, duration: 500 }),
      makeEvent({ timestamp: 500, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3, speed: 1 };
    const result = compressTimeline(events, config);

    expect(result[0].duration).toBe(500);
  });

  it("should apply speed multiplier", () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 0, duration: 2000 }),
      makeEvent({ timestamp: 2000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, speed: 2, maxPause: 10 };
    const result = compressTimeline(events, config);

    expect(result[0].timestamp).toBe(0);
    expect(result[0].duration).toBe(1000); // 2000 / 2
    expect(result[1].timestamp).toBe(1000); // 2000 / 2
  });

  it("should truncate very long tool results", () => {
    const longText = Array(100)
      .fill("a]".repeat(30))
      .join("\n");
    const events: TimelineEvent[] = [
      makeEvent({ kind: "tool_result", text: longText }),
    ];

    const result = compressTimeline(events, DEFAULT_CONFIG);
    const lineCount = result[0].text.split("\n").length;
    expect(lineCount).toBeLessThan(100);
  });

  it("should handle empty timeline", () => {
    const result = compressTimeline([], DEFAULT_CONFIG);
    expect(result).toHaveLength(0);
  });

  it("should aggressively compress pauses within tool chains", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "tool_use", timestamp: 0, duration: 5000, toolName: "Bash" }),
      makeEvent({ kind: "tool_result", timestamp: 5000, duration: 5000 }),
      makeEvent({ kind: "tool_use", timestamp: 10000, duration: 5000, toolName: "Read" }),
      makeEvent({ kind: "tool_result", timestamp: 15000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3 };
    const result = compressTimeline(events, config);

    // Pauses between tool_use -> tool_result and tool_result -> tool_use
    // should be capped to 500ms (not the full maxPause of 3s)
    expect(result[0].duration).toBeLessThanOrEqual(500);
    expect(result[1].duration).toBeLessThanOrEqual(500);
    expect(result[2].duration).toBeLessThanOrEqual(500);
  });

  it("should add preUserPause on top of duration before user message", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, duration: 10000 }),
      makeEvent({ kind: "user_message", timestamp: 10000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3, preUserPause: 5 };
    const result = compressTimeline(events, config);

    // Duration = capped to maxPause (3000ms) + preUserPause (5000ms) = 8000ms, then / speed
    expect(result[0].duration).toBe((3000 + 5000) / config.speed);
  });

  it("should add preUserPause from any event before user message", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "tool_result", timestamp: 0, duration: 10000 }),
      makeEvent({ kind: "user_message", timestamp: 10000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3, preUserPause: 4 };
    const result = compressTimeline(events, config);

    // Duration = capped to maxPause (3000ms) + preUserPause (4000ms) = 7000ms, then / speed
    expect(result[0].duration).toBe((3000 + 4000) / config.speed);
  });

  it("should fall back to 2x responsePause for preUserPause", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, duration: 10000 }),
      makeEvent({ kind: "user_message", timestamp: 10000, duration: 1000 }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 3, responsePause: 2, preUserPause: undefined };
    const result = compressTimeline(events, config);

    // preUserPause falls back to 2x responsePause = 4000ms
    // Duration = capped to maxPause (3000ms) + 4000ms = 7000ms, then / speed
    expect(result[0].duration).toBe((3000 + 4000) / config.speed);
  });

  it("should add extra pause on top of capped duration, not use it as a minimum", () => {
    // A long assistant_text (10s) before a user_message
    // The extra pause should be ADDED, not used as Math.max
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, duration: 10000, text: "short" }),
      makeEvent({ kind: "user_message", timestamp: 10000, duration: 1000, text: "hi" }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 2, preUserPause: 3, speed: 1 };
    const result = compressTimeline(events, config);

    // Duration should be capped(2000) + preUserPause(3000) = 5000, not max(2000, 3000) = 3000
    // (before render time guarantee, which for "short" text is negligible)
    expect(result[0].duration).toBeGreaterThanOrEqual(5000);
  });

  it("should guarantee duration covers renderTime * speed + extra pause", () => {
    // Long assistant_text that takes a long time to render, with a very short original duration
    // renderTime = 500 chars / 50 chars/sec = 10s = 10000ms
    // With speed=2: renderTime * speed = 20000ms
    const longText = "A".repeat(500);
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, duration: 100, text: longText }),
      makeEvent({ kind: "assistant_text", timestamp: 100, duration: 1000, text: "next" }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      maxPause: 1,
      speed: 2,
      responseTypingSpeed: 50,
      responsePause: 0,
      preUserPause: 0,
    };
    const result = compressTimeline(events, config);

    // renderTime = 500/50 * 1000 = 10000ms, renderTime * speed = 20000ms
    // After /speed, duration should be >= 10000ms (= 20000 / 2)
    // i.e. enough time for the renderer to finish typing the text
    expect(result[0].duration).toBeGreaterThanOrEqual(10000 / config.speed);
  });

  it("should guarantee render time + extra pause together", () => {
    // Long assistant_text before user_message: duration must cover renderTime AND extra pause
    const longText = "B".repeat(400);
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, duration: 100, text: longText }),
      makeEvent({ kind: "user_message", timestamp: 100, duration: 1000, text: "hi" }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      maxPause: 1,
      speed: 2,
      responseTypingSpeed: 50,
      preUserPause: 2,
    };
    const result = compressTimeline(events, config);

    // renderTime = 400/50*1000 = 8000ms, renderTime*speed = 16000ms
    // extra = preUserPause = 2000ms
    // minDuration = 16000 + 2000 = 18000ms (pre-speed-division)
    // After /speed: 18000/2 = 9000ms
    expect(result[0].duration).toBeGreaterThanOrEqual(9000);
  });

  it("should give tool_use events zero estimated render time", () => {
    // A tool_use with a very short duration should NOT be inflated by render time
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "tool_use",
        timestamp: 0,
        duration: 200,
        toolName: "Bash",
        text: "$ npm run build\nsome output\nmore output\neven more\nfifth line",
      }),
      makeEvent({ kind: "tool_result", timestamp: 200, duration: 300, text: "ok" }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 10, speed: 1 };
    const result = compressTimeline(events, config);

    // tool_use should keep its original short duration (within tool chain cap of 500ms)
    // NOT be inflated by text length / typing speed
    expect(result[0].duration).toBeLessThanOrEqual(500);
  });

  it("should give tool_result events zero estimated render time", () => {
    const longToolOutput = "line\n".repeat(50);
    const events: TimelineEvent[] = [
      makeEvent({
        kind: "tool_result",
        timestamp: 0,
        duration: 100,
        text: longToolOutput,
      }),
      makeEvent({ kind: "assistant_text", timestamp: 100, duration: 1000, text: "done" }),
    ];

    const config: CastConfig = { ...DEFAULT_CONFIG, maxPause: 10, speed: 1 };
    const result = compressTimeline(events, config);

    // tool_result should not be inflated by its text length
    expect(result[0].duration).toBe(100);
  });

  it("should estimate render time for long user messages using agentSpeed", () => {
    // A long user message (>200 chars) should use agentSpeed for render time estimation
    const longUserText = "X".repeat(400);
    const events: TimelineEvent[] = [
      makeEvent({ kind: "user_message", timestamp: 0, duration: 100, text: longUserText }),
      makeEvent({ kind: "assistant_text", timestamp: 100, duration: 1000, text: "ok" }),
    ];

    const config: CastConfig = {
      ...DEFAULT_CONFIG,
      maxPause: 10,
      speed: 1,
      userTypingSpeed: 25, // slow
      agentSpeed: 800,     // fast
      responsePause: 1,
    };
    const result = compressTimeline(events, config);

    // With agentSpeed: renderTime = 400/800*1000 = 500ms
    // With userTypingSpeed: would be 400/25*1000 = 16000ms
    // The actual duration should reflect agentSpeed, not userTypingSpeed
    // responsePause extra = 1000ms (after user_message)
    // minDuration = renderTime*speed + extra = 500 + 1000 = 1500ms
    // The duration should be reasonable (not 16000+)
    expect(result[0].duration).toBeLessThan(5000);
  });
});
