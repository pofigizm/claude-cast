import type { TimelineEvent, CastConfig } from "./types.js";

/**
 * Determine the "phase" of a timeline event for per-phase timing.
 */
type Phase = "user" | "agent" | "response";

function getPhase(kind: TimelineEvent["kind"]): Phase {
  switch (kind) {
    case "user_message":
      return "user";
    case "tool_use":
    case "tool_result":
      return "agent";
    case "assistant_text":
      return "response";
  }
}

/**
 * Check if event is part of an agent tool chain (tool_use or tool_result).
 */
function isToolChain(kind: TimelineEvent["kind"]): boolean {
  return kind === "tool_use" || kind === "tool_result";
}

/**
 * Get the maximum pause allowed for a transition between phases.
 * Aggressively compress pauses within tool chains.
 * Add breathing pause after assistant responses before next user input.
 */
function getMaxPauseForTransition(
  currentKind: TimelineEvent["kind"],
  nextKind: TimelineEvent["kind"] | undefined,
  config: CastConfig
): number {
  const maxPauseMs = config.maxPause * 1000;
  const responsePauseMs = (config.responsePause ?? config.maxPause) * 1000;

  // Within tool chains: aggressively compress pauses
  if (isToolChain(currentKind) && nextKind && isToolChain(nextKind)) {
    return Math.min(500, maxPauseMs); // max 500ms between tool calls
  }

  // After assistant response before next user input: breathing pause
  if (currentKind === "assistant_text" && nextKind === "user_message") {
    return responsePauseMs;
  }

  return maxPauseMs;
}

/**
 * Compress timeline by:
 * - Capping long pauses to maxPause (phase-aware)
 * - Aggressively compressing pauses within tool chains
 * - Adding breathing pauses after assistant responses
 * - Truncating very long tool results
 * - Applying speed multiplier
 */
export function compressTimeline(
  events: TimelineEvent[],
  config: CastConfig
): TimelineEvent[] {
  const compressed: TimelineEvent[] = [];
  let timeOffset = 0;

  for (let i = 0; i < events.length; i++) {
    const event = { ...events[i] };

    // Adjust timestamp with accumulated offset
    event.timestamp = events[i].timestamp + timeOffset;

    // Phase-aware pause capping
    const nextKind = i < events.length - 1 ? events[i + 1].kind : undefined;
    const effectiveMaxPause = getMaxPauseForTransition(event.kind, nextKind, config);

    const originalDuration = events[i].duration;
    if (originalDuration > effectiveMaxPause) {
      const newDuration = effectiveMaxPause;
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
