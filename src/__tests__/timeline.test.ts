import { describe, it, expect } from "vitest";
import { buildTimeline } from "../timeline.js";
import type { TimelineEvent } from "../types.js";

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    kind: "assistant_text",
    timestamp: 0,
    duration: 1000,
    text: "test",
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("should sort events by timestamp", () => {
    const events: TimelineEvent[] = [
      makeEvent({ timestamp: 2000 }),
      makeEvent({ timestamp: 1000 }),
      makeEvent({ timestamp: 0 }),
    ];

    const result = buildTimeline(events);
    expect(result[0].timestamp).toBe(0);
    expect(result[1].timestamp).toBe(1000);
    expect(result[2].timestamp).toBe(2000);
  });

  it("should merge adjacent assistant_text events", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, text: "Hello " }),
      makeEvent({ kind: "assistant_text", timestamp: 50, text: "world" }),
    ];

    const result = buildTimeline(events);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello world");
  });

  it("should not merge non-adjacent text events", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, text: "Hello " }),
      makeEvent({ kind: "tool_use", timestamp: 500, text: "cmd" }),
      makeEvent({ kind: "assistant_text", timestamp: 1000, text: "world" }),
    ];

    const result = buildTimeline(events);
    expect(result).toHaveLength(3);
  });

  it("should handle empty input", () => {
    const result = buildTimeline([]);
    expect(result).toHaveLength(0);
  });

  it("should recalculate durations after merge", () => {
    const events: TimelineEvent[] = [
      makeEvent({ kind: "assistant_text", timestamp: 0, text: "a" }),
      makeEvent({ kind: "assistant_text", timestamp: 50, text: "b" }),
      makeEvent({ kind: "tool_use", timestamp: 2000, text: "cmd" }),
    ];

    const result = buildTimeline(events);
    expect(result).toHaveLength(2);
    // First merged event should have duration = 2000 - 0 = 2000
    expect(result[0].duration).toBe(2000);
  });
});
