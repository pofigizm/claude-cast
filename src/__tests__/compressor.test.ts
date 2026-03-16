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
});
