export { parseLogFile, parseLogContent, extractEvents } from "./parser.js";
export { buildTimeline } from "./timeline.js";
export { compressTimeline } from "./compressor.js";
export { renderAsciicast } from "./renderer.js";
export { exportCast, exportOutput } from "./exporter.js";
export { DEFAULT_CONFIG } from "./types.js";
export type { CastConfig, TimelineEvent, LogEntry } from "./types.js";

import { parseLogFile, extractEvents } from "./parser.js";
import { buildTimeline } from "./timeline.js";
import { compressTimeline } from "./compressor.js";
import { renderAsciicast } from "./renderer.js";
import { exportOutput } from "./exporter.js";
import type { CastConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

/**
 * Main pipeline: JSONL file → output file
 */
export function convertLog(
  inputPath: string,
  outputPath: string,
  options: Partial<CastConfig> = {}
): void {
  const config: CastConfig = { ...DEFAULT_CONFIG, ...options };

  // 1. Parse
  const entries = parseLogFile(inputPath);
  if (entries.length === 0) {
    throw new Error(`No valid log entries found in ${inputPath}`);
  }

  // 2. Extract events
  const rawEvents = extractEvents(entries);
  if (rawEvents.length === 0) {
    throw new Error("No displayable events found in log");
  }

  // 3. Build timeline
  const timeline = buildTimeline(rawEvents);

  // 4. Compress
  const compressed = compressTimeline(timeline, config);

  // 5. Render
  const { header, events } = renderAsciicast(compressed, config);

  // 6. Export
  exportOutput(header, events, outputPath, config);
}
