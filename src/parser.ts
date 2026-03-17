import { readFileSync } from "fs";
import type { LogEntry, ContentBlock, TimelineEvent, EventKind } from "./types.js";

/**
 * Parse a Claude Code JSONL log file into structured log entries.
 */
export function parseLogFile(filePath: string): LogEntry[] {
  const content = readFileSync(filePath, "utf-8");
  return parseLogContent(content);
}

export function parseLogContent(content: string): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as LogEntry);
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

/**
 * Extract timeline events from parsed log entries.
 */
export function extractEvents(entries: LogEntry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let baseTime = 0;
  let baseTimeSet = false;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
    if (!baseTimeSet && ts > 0) {
      baseTime = ts;
      baseTimeSet = true;
    }
    const relativeTime = ts > 0 ? ts - baseTime : 0;

    const message = entry.message;
    if (!message) continue;

    const blocks = normalizeContent(message.content);

    for (const block of blocks) {
      const event = blockToEvent(block, message.role, relativeTime);
      if (event) events.push(event);
    }
  }

  // Assign durations based on gaps between events
  for (let i = 0; i < events.length - 1; i++) {
    events[i].duration = events[i + 1].timestamp - events[i].timestamp;
  }
  if (events.length > 0) {
    events[events.length - 1].duration = 1000; // last event: 1s
  }

  return events;
}

function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  return content;
}

function blockToEvent(
  block: ContentBlock,
  role: string,
  timestamp: number
): TimelineEvent | null {
  if (block.type === "text" && block.text) {
    const kind: EventKind = role === "user" ? "user_message" : "assistant_text";
    return {
      kind,
      timestamp,
      duration: 0,
      text: block.text,
      caption: role === "user" ? "User message" : undefined,
      raw: block,
    };
  }

  if (block.type === "tool_use" && block.name) {
    const caption = buildToolCaption(block.name, block.input);
    const text = buildToolDisplayText(block.name, block.input);
    return {
      kind: "tool_use",
      timestamp,
      duration: 0,
      toolName: block.name,
      caption,
      text,
      raw: block,
    };
  }

  if (block.type === "tool_result") {
    const resultText = extractToolResultText(block);
    return {
      kind: "tool_result",
      timestamp,
      duration: 0,
      text: resultText,
      raw: block,
    };
  }

  return null;
}

function buildToolCaption(name: string, input?: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return `Reading ${input?.file_path || "file"}`;
    case "Write":
      return `Writing ${input?.file_path || "file"}`;
    case "Edit":
      return `Editing ${input?.file_path || "file"}`;
    case "Bash":
      return `Running command`;
    case "Grep":
      return `Searching for "${input?.pattern || "..."}"`;
    case "Glob":
      return `Finding files: ${input?.pattern || "..."}`;
    case "Agent":
      return `Launching agent`;
    case "TodoWrite":
      return `Updating tasks`;
    case "WebFetch":
      return `Fetching URL`;
    default:
      return `Using ${name}`;
  }
}

function buildToolDisplayText(name: string, input?: Record<string, unknown>): string {
  switch (name) {
    case "Bash": {
      const cmd = input?.command as string | undefined;
      return cmd ? `$ ${cmd}` : `$ (command)`;
    }
    case "Read":
      return `cat ${input?.file_path || "file"}`;
    case "Write":
      return `write → ${input?.file_path || "file"}`;
    case "Edit": {
      const fp = input?.file_path || "file";
      const old = (input?.old_string as string) || "";
      const nw = (input?.new_string as string) || "";
      const preview = old.length > 60 ? old.slice(0, 60) + "..." : old;
      return `edit ${fp}\n  - ${preview}\n  + ${nw.length > 60 ? nw.slice(0, 60) + "..." : nw}`;
    }
    case "Grep":
      return `grep "${input?.pattern || ""}" ${input?.path || "."}`;
    case "Glob":
      return `glob ${input?.pattern || ""}`;
    default:
      return JSON.stringify(input || {}).slice(0, 200);
  }
}

function extractToolResultText(block: ContentBlock): string {
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return block.content
      .map((b) => b.text || "")
      .filter(Boolean)
      .join("\n");
  }
  return "(result)";
}
