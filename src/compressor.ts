import type { TimelineEvent, CastConfig } from "./types.js";

/**
 * Compress timeline by:
 * - Capping long pauses to maxPause
 * - Truncating very long tool results
 * - Applying speed multiplier
 */
export function compressTimeline(
  events: TimelineEvent[],
  config: CastConfig
): TimelineEvent[] {
  const maxPauseMs = config.maxPause * 1000;
  const compressed: TimelineEvent[] = [];
  let timeOffset = 0;

  for (let i = 0; i < events.length; i++) {
    const event = { ...events[i] };

    // Adjust timestamp with accumulated offset
    event.timestamp = events[i].timestamp + timeOffset;

    // Cap duration
    const originalDuration = events[i].duration;
    if (originalDuration > maxPauseMs) {
      const newDuration = maxPauseMs;
      timeOffset -= originalDuration - newDuration;
      event.duration = newDuration;
    }

    // Truncate very long tool results
    if (event.kind === "tool_result" && event.text.length > 2000) {
      const lines = event.text.split("\n");
      if (lines.length > 30) {
        event.text =
          lines.slice(0, 15).join("\n") +
          `\n... (${lines.length - 30} lines truncated) ...\n` +
          lines.slice(-15).join("\n");
      }
    }

    // Apply speed multiplier
    event.timestamp = event.timestamp / config.speed;
    event.duration = event.duration / config.speed;

    compressed.push(event);
  }

  return compressed;
}
