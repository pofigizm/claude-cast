export { parseLogFile, parseLogContent, extractEvents } from "./parser.js";
export { buildTimeline } from "./timeline.js";
export { compressTimeline } from "./compressor.js";
export { renderAsciicast } from "./renderer.js";
export { exportCast, exportOutput } from "./exporter.js";
export { scanTimeline, redactTimeline, formatFindings, checkSecretsFile } from "./secrets.js";
export { classifyText, isPastedContent, classifySegments } from "./text-classifier.js";
export { DEFAULT_CONFIG } from "./types.js";
export type { CastConfig, TimelineEvent, LogEntry } from "./types.js";
export type { SecretsCheckMode, SecretFinding } from "./secrets.js";
export type { TextClass, ClassifiedSegment } from "./text-classifier.js";

import { basename } from "path";
import { parseLogFile, extractEvents } from "./parser.js";
import { buildTimeline } from "./timeline.js";
import { compressTimeline } from "./compressor.js";
import { renderAsciicast } from "./renderer.js";
import { exportOutput } from "./exporter.js";
import { scanTimeline, redactTimeline, formatFindings } from "./secrets.js";
import type { CastConfig } from "./types.js";
import type { SecretsCheckMode } from "./secrets.js";
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

  // Default title: "Claude Code Session — <filename>"
  if (!config.title) {
    config.title = `Claude Code Session — ${basename(inputPath)}`;
  }

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

  // 3.5. Secrets detection
  const secretsMode: SecretsCheckMode = config.secretsCheck ?? "warn";
  if (secretsMode !== "off") {
    const findings = scanTimeline(timeline);
    if (findings.length > 0) {
      const report = formatFindings(findings);
      if (secretsMode === "strict") {
        throw new Error(`Secrets detected in log. Aborting.\n${report}`);
      }
      // warn mode: print and continue
      console.warn(report);
    }
  }

  // 3.6. Redact secrets if requested
  if (config.redact) {
    redactTimeline(timeline);
  }

  // 4. Compress
  const compressed = compressTimeline(timeline, config);

  // 5. Render
  const { header, events } = renderAsciicast(compressed, config);

  // 6. Export
  exportOutput(header, events, outputPath, config);
}
