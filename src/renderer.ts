import type { TimelineEvent, CastConfig, AsciicastHeader, AsciicastEvent } from "./types.js";
import { classifyText, isPastedContent } from "./text-classifier.js";

const ESC = "\x1b";
const CSI = `${ESC}[`;
const RESET = `${CSI}0m`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const BLUE = `${CSI}34m`;
const MAGENTA = `${CSI}35m`;
const CYAN = `${CSI}36m`;
const WHITE = `${CSI}37m`;
const BG_BLUE = `${CSI}44m`;
const BG_BLACK = `${CSI}40m`;

/**
 * Get the effective typing speed (chars/sec) for a given event kind.
 * Per-phase speeds override the global typingSpeed fallback.
 * Adaptive speed: technical text renders faster than narrative text.
 */
function getTypingSpeed(kind: TimelineEvent["kind"], config: CastConfig, text?: string): number {
  switch (kind) {
    case "user_message": {
      const baseSpeed = config.userTypingSpeed ?? config.typingSpeed;
      // Pasted content (logs, code, stack traces) renders at agent speed
      if (text && isPastedContent(text)) {
        return config.agentSpeed ?? config.typingSpeed;
      }
      return baseSpeed;
    }
    case "assistant_text": {
      const baseSpeed = config.responseTypingSpeed ?? config.typingSpeed;
      // Technical blocks (code, JSON, tables) render faster
      if (text && classifyText(text) === "technical") {
        // Use 3x the base response speed, but cap at agent speed
        const fastSpeed = baseSpeed * 3;
        const agentSpeed = config.agentSpeed ?? config.typingSpeed;
        return Math.min(fastSpeed, agentSpeed);
      }
      return baseSpeed;
    }
    case "tool_use":
    case "tool_result":
      return config.agentSpeed ?? config.typingSpeed;
  }
}

/**
 * Render timeline events into asciicast v2 frames.
 */
export function renderAsciicast(
  events: TimelineEvent[],
  config: CastConfig
): { header: AsciicastHeader; events: AsciicastEvent[] } {
  const header: AsciicastHeader = {
    version: 2,
    width: config.width,
    height: config.height,
    title: config.title || "Claude Code Session",
    env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
  };

  const frames: AsciicastEvent[] = [];
  let currentTime = 0;

  // Initial prompt
  frames.push([0, "o", `${BOLD}${GREEN}claude ${RESET}${DIM}~ ${RESET}\r\n`]);

  for (const event of events) {
    currentTime = event.timestamp / 1000; // convert ms to seconds

    switch (event.kind) {
      case "user_message":
        frames.push(...renderUserMessage(event, currentTime, config));
        break;
      case "assistant_text":
        frames.push(...renderAssistantText(event, currentTime, config));
        break;
      case "tool_use":
        frames.push(...renderToolUse(event, currentTime, config));
        break;
      case "tool_result":
        frames.push(...renderToolResult(event, currentTime, config));
        break;
    }
  }

  // Final frame: done
  frames.push([
    currentTime + 1,
    "o",
    `\r\n${BOLD}${GREEN}claude ${RESET}${DIM}Session complete.${RESET}\r\n`,
  ]);

  return { header, events: frames };
}

function renderUserMessage(
  event: TimelineEvent,
  time: number,
  config: CastConfig
): AsciicastEvent[] {
  const frames: AsciicastEvent[] = [];
  const lines = wrapText(event.text, config.width - 4);
  const header = `${BOLD}${CYAN}> User:${RESET}`;
  frames.push([time, "o", `\r\n${header}\r\n`]);

  const totalChars = lines.reduce((sum, l) => sum + l.length, 0);
  const speed = getTypingSpeed("user_message", config, event.text);
  const totalTime = totalChars / speed;
  let charCount = 0;

  // Word-by-word output for user messages
  for (const line of lines) {
    const words = line.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      const t = time + (totalChars > 0 ? (charCount / totalChars) * totalTime : 0);
      frames.push([t, "o", `  \r\n`]);
      continue;
    }
    for (let w = 0; w < words.length; w++) {
      const t = time + (totalChars > 0 ? (charCount / totalChars) * totalTime : 0);
      let out = "";
      if (w === 0) out += `  ${CYAN}`;
      out += words[w];
      if (w < words.length - 1) {
        out += " ";
        charCount += words[w].length + 1;
      } else {
        out += `${RESET}\r\n`;
        charCount += words[w].length;
      }
      frames.push([t, "o", out]);
    }
  }

  if (config.showCaptions) {
    frames.push([time, "o", renderInlineCaption("User message")]);
  }

  return frames;
}

function renderAssistantText(
  event: TimelineEvent,
  time: number,
  config: CastConfig
): AsciicastEvent[] {
  const frames: AsciicastEvent[] = [];
  const lines = wrapText(event.text, config.width - 2);

  frames.push([time, "o", `\r\n`]);

  // Word-by-word typing effect for assistant text
  // Long texts render faster so they don't dominate the screencast
  const baseSpeed = getTypingSpeed("assistant_text", config, event.text);
  const displayLines = lines.slice(0, 30);
  const totalChars = displayLines.reduce((sum, l) => sum + l.length, 0);
  const baseTime = totalChars / baseSpeed;
  const maxRenderSec = config.maxPause * 2;
  const speed = baseTime > maxRenderSec ? totalChars / maxRenderSec : baseSpeed;
  const totalTime = totalChars / speed;
  let charCount = 0;

  for (const line of displayLines) {
    const words = line.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      const t = time + (totalChars > 0 ? (charCount / totalChars) * totalTime : 0);
      frames.push([t, "o", `\r\n`]);
      continue;
    }
    for (let w = 0; w < words.length; w++) {
      const t = time + (totalChars > 0 ? (charCount / totalChars) * totalTime : 0);
      let out = "";
      if (w === 0) out += `${WHITE}`;
      out += words[w];
      if (w < words.length - 1) {
        out += " ";
        charCount += words[w].length + 1;
      } else {
        out += `${RESET}\r\n`;
        charCount += words[w].length;
      }
      frames.push([t, "o", out]);
    }
  }

  if (lines.length > 30) {
    frames.push([
      time + totalTime,
      "o",
      `${DIM}... (${lines.length - 30} more lines)${RESET}\r\n`,
    ]);
  }

  return frames;
}

function renderToolUse(
  event: TimelineEvent,
  time: number,
  config: CastConfig
): AsciicastEvent[] {
  const frames: AsciicastEvent[] = [];
  const toolName = event.toolName || "tool";
  const speed = getTypingSpeed("tool_use", config);
  const lineDelay = Math.min(0.05, 10 / speed); // faster agent speed = smaller delay

  // Tool header
  const toolColor = getToolColor(toolName);
  frames.push([
    time,
    "o",
    `\r\n${BOLD}${toolColor}[${toolName}]${RESET} `,
  ]);

  // Tool content (command, file path, etc.)
  const lines = event.text.split("\n");
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (i === 0) {
      frames.push([time + lineDelay, "o", `${DIM}${lines[i]}${RESET}\r\n`]);
    } else {
      frames.push([time + lineDelay * (i + 1), "o", `  ${DIM}${lines[i]}${RESET}\r\n`]);
    }
  }

  // Inline caption
  if (config.showCaptions && event.caption) {
    frames.push([time, "o", renderInlineCaption(event.caption)]);
  }

  return frames;
}

function renderToolResult(
  event: TimelineEvent,
  time: number,
  config: CastConfig
): AsciicastEvent[] {
  const frames: AsciicastEvent[] = [];

  if (!event.text || event.text === "(result)") return frames;

  const speed = getTypingSpeed("tool_result", config);
  const lineDelay = Math.min(0.02, 10 / speed);

  const lines = event.text.split("\n");
  const maxLines = 15;
  const displayLines = lines.slice(0, maxLines);

  frames.push([time, "o", `${DIM}`]);
  for (let i = 0; i < displayLines.length; i++) {
    const line = displayLines[i].slice(0, config.width - 2);
    frames.push([time + lineDelay * i, "o", `  ${line}\r\n`]);
  }
  if (lines.length > maxLines) {
    frames.push([
      time + lineDelay * maxLines,
      "o",
      `  ... (${lines.length - maxLines} more lines)\r\n`,
    ]);
  }
  frames.push([time + lineDelay * displayLines.length, "o", RESET]);

  return frames;
}

function renderInlineCaption(text: string): string {
  return `${BG_BLUE}${WHITE}${BOLD} ${text} ${RESET}\r\n`;
}

function getToolColor(toolName: string): string {
  switch (toolName) {
    case "Bash":
      return YELLOW;
    case "Read":
      return BLUE;
    case "Write":
      return GREEN;
    case "Edit":
      return MAGENTA;
    case "Grep":
    case "Glob":
      return CYAN;
    default:
      return WHITE;
  }
}

function wrapText(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= maxWidth) {
      result.push(rawLine);
    } else {
      for (let i = 0; i < rawLine.length; i += maxWidth) {
        result.push(rawLine.slice(i, i + maxWidth));
      }
    }
  }
  return result;
}
