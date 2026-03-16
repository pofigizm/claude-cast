import type { TimelineEvent } from "./types.js";

/**
 * Build a clean timeline from raw extracted events.
 * - Sorts by timestamp
 * - Merges adjacent assistant text blocks
 * - Ensures monotonically increasing timestamps
 */
export function buildTimeline(events: TimelineEvent[]): TimelineEvent[] {
  if (events.length === 0) return [];

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // Merge consecutive assistant_text events
  const merged: TimelineEvent[] = [];
  for (const event of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.kind === "assistant_text" &&
      event.kind === "assistant_text" &&
      event.timestamp - prev.timestamp < 100 // within 100ms = same burst
    ) {
      prev.text += event.text;
      prev.duration = event.timestamp + event.duration - prev.timestamp;
    } else {
      merged.push({ ...event });
    }
  }

  // Recalculate durations based on gaps
  for (let i = 0; i < merged.length - 1; i++) {
    merged[i].duration = merged[i + 1].timestamp - merged[i].timestamp;
  }
  if (merged.length > 0) {
    merged[merged.length - 1].duration = 1000;
  }

  return merged;
}
