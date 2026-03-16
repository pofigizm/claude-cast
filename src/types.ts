// --- Claude Code Log Types ---

export interface LogEntry {
  type: string;
  timestamp?: string;
  message?: MessageEntry;
  // conversation_id, session_id etc may be present
  [key: string]: unknown;
}

export interface MessageEntry {
  role: "user" | "assistant";
  content: string | ContentBlock[];
  model?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string; // tool name
  id?: string; // tool_use id
  input?: Record<string, unknown>;
  tool_use_id?: string; // for tool_result
  content?: string | ContentBlock[];
}

// --- Timeline Types ---

export type EventKind =
  | "user_message"
  | "assistant_text"
  | "tool_use"
  | "tool_result";

export interface TimelineEvent {
  kind: EventKind;
  timestamp: number; // ms since start
  duration: number; // ms
  toolName?: string;
  caption?: string;
  text: string; // display text
  raw?: ContentBlock;
}

// --- Asciicast Types ---

export interface AsciicastHeader {
  version: 2;
  width: number;
  height: number;
  timestamp?: number;
  title?: string;
  env?: Record<string, string>;
}

export type AsciicastEvent = [number, "o" | "i", string]; // [time, type, data]

// --- Config ---

export interface CastConfig {
  width: number;
  height: number;
  speed: number;
  maxPause: number; // max pause duration in seconds
  typingSpeed: number; // chars per second for simulated typing
  showCaptions: boolean;
  format: "cast" | "gif" | "mp4";
}

export const DEFAULT_CONFIG: CastConfig = {
  width: 120,
  height: 40,
  speed: 1,
  maxPause: 3,
  typingSpeed: 80,
  showCaptions: true,
  format: "cast",
};
