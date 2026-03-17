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
 * Add breathing pause after assistant responses.
 * Add longer pause before user input so viewer can absorb previous output.
 */
function getMaxPauseForTransition(
  currentKind: TimelineEvent["kind"],
  nextKind: TimelineEvent["kind"] | undefined,
  config: CastConfig
): number {
  const maxPauseMs = config.maxPause * 1000;

  // Within tool chains: aggressively compress pauses
  if (isToolChain(currentKind) && nextKind && isToolChain(nextKind)) {
    return Math.min(500, maxPauseMs); // max 500ms between tool calls
  }

  return maxPauseMs;
}

/**
 * Get extra pause to ADD after an event for phase transitions.
 * This pause is added on top of the event's duration, not absorbed by it.
 */
function getExtraPause(
  currentKind: TimelineEvent["kind"],
  nextKind: TimelineEvent["kind"] | undefined,
  config: CastConfig
): number {
  const responsePauseMs = (config.responsePause ?? 3) * 1000;
  const preUserMs = (config.preUserPause ?? responsePauseMs / 1000 * 2) * 1000;

  // Before user input: extra pause so viewer absorbs previous output
  if (nextKind === "user_message") {
    return preUserMs;
  }

  // After user input: extra pause so viewer reads the question
  if (currentKind === "user_message") {
    return responsePauseMs;
  }

  return 0;
}

/**
 * Estimate minimum render time for an event in ms.
 * This ensures duration is long enough for the text to finish rendering
 * before the extra pause begins.
 */
function estimateRenderTime(event: TimelineEvent, config: CastConfig): number {
  if (!event.text) return 0;

  switch (event.kind) {
    case "user_message": {
      const isLong = event.text.length > 200;
      const speed = isLong
        ? (config.agentSpeed ?? config.typingSpeed)
        : (config.userTypingSpeed ?? config.typingSpeed);
      return (event.text.length / speed) * 1000;
    }
    case "assistant_text": {
      const speed = config.responseTypingSpeed ?? config.typingSpeed;
      return (event.text.length / speed) * 1000;
    }
    case "tool_use":
    case "tool_result":
      // Tool events render line-by-line with tiny fixed delays (~0.02s/line)
      // No need to guarantee extra duration for them
      return 0;
  }
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
    // Cap long pauses first
    if (originalDuration > effectiveMaxPause) {
      const newDuration = effectiveMaxPause;
      timeOffset -= originalDuration - newDuration;
      event.duration = newDuration;
    }

    // Add extra pause on top of duration for phase transitions
    const extra = getExtraPause(event.kind, nextKind, config);
    if (extra > 0) {
      event.duration += extra;
      timeOffset += extra;
    }

    // Ensure duration covers render time + extra pause
    // renderTime is in "real" ms, but duration will be divided by speed later,
    // while renderer uses totalChars/speed directly (not affected by speed multiplier).
    // So we need renderTime * speed to match the pre-division duration space.
    const renderTime = estimateRenderTime(event, config) * config.speed;
    const minDuration = renderTime + extra;
    if (event.duration < minDuration) {
      const diff = minDuration - event.duration;
      event.duration = minDuration;
      timeOffset += diff;
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
