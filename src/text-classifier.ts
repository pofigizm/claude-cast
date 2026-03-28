/**
 * Text classifier: detect narrative vs technical text for adaptive rendering speed.
 *
 * "narrative" = human-readable prose that the viewer should read slowly
 * "technical" = code, JSON, logs, stack traces, etc. that can scroll fast
 */

export type TextClass = "narrative" | "technical";

export interface ClassifiedSegment {
  text: string;
  classification: TextClass;
}

// Patterns that indicate technical/pasted content
const TECHNICAL_PATTERNS = [
  /^\s*[\[{]/, // starts with [ or { (JSON)
  /^\s*at\s+\S+\s*\(/, // stack trace: "at Function (/path:line:col)"
  /^\s*at\s+\S+\s*$/, // stack trace: "at Object.run"
  /^\s*(import|export|const|let|var|function|class|interface|type|enum)\s/, // code keywords
  /^\s*(if|else|for|while|switch|case|return|throw|try|catch)\s*[\({]/, // control flow
  /^\s*\/\//, // single-line comment
  /^\s*\/\*/, // block comment start
  /^\s*\*/, // block comment continuation
  /^\s*#!/, // shebang
  /^\s*#\s*\S/, // shell comments or markdown headings (in code context)
  /^\s*\$\s+\S/, // shell command: $ npm install
  /^\s*>>>/, // python REPL
  /^\s*\d+[.:]\s/, // numbered output: "1. " or "1: "
  /^\s*[-|+]{3,}/, // diff markers or table separators
  /^[+-]\s/, // diff lines
  /^\s*[<>]\s/, // XML/HTML tags or diff markers
  /\S+\(\S*:\d+:\d+\)/, // file:line:col references
  /^https?:\/\//, // URLs
  /^[A-Z_]{2,}=/, // ENV_VAR=value
  /^\s*\|.*\|/, // table rows
  /^\s*```/, // fenced code block markers
  /^\s*~~~/, // alternate fenced code block
  /^\s*\w+\s*[=:]\s*["{[\d]/, // config-style: key = "value" or key: 123
  /^\s*"[^"]+"\s*:/, // JSON key: "key":
];

// Patterns that indicate pasted/machine content in user messages
const PASTED_CONTENT_PATTERNS = [
  /\n.*\n.*\n.*\n.*\n/s, // 5+ lines of multi-line content
  /^\s*Error:/m, // error messages
  /^\s*Traceback/m, // Python traceback
  /^\s*panic:/m, // Go panic
  /ENOENT|EPERM|EACCES|ETIMEDOUT/, // system errors
  /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, // timestamps in logs
];

/**
 * Classify a single line as narrative or technical.
 */
function classifyLine(line: string): TextClass {
  const trimmed = line.trim();

  // Empty or very short lines are neutral, treat as narrative
  if (trimmed.length === 0) return "narrative";

  // Check technical patterns
  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.test(trimmed)) return "technical";
  }

  // High ratio of special characters = technical
  const specialChars = trimmed.replace(/[a-zA-Z0-9\s.,!?;:'"()-]/g, "").length;
  if (trimmed.length > 10 && specialChars / trimmed.length > 0.35) {
    return "technical";
  }

  return "narrative";
}

/**
 * Classify a block of text, returning the dominant classification.
 * Used for determining the overall speed of a text block.
 */
export function classifyText(text: string): TextClass {
  const lines = text.split("\n");
  if (lines.length === 0) return "narrative";

  let technicalLines = 0;
  let narrativeLines = 0;

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (classifyLine(line) === "technical") {
      technicalLines++;
    } else {
      narrativeLines++;
    }
  }

  const total = technicalLines + narrativeLines;
  if (total === 0) return "narrative";

  // If more than 40% of lines are technical, classify the whole block as technical
  return technicalLines / total > 0.4 ? "technical" : "narrative";
}

/**
 * Detect if a user message looks like pasted content (logs, stack traces, code)
 * rather than something typed by hand.
 */
export function isPastedContent(text: string): boolean {
  // Short messages are likely typed
  if (text.length < 100) return false;

  // Check for pasted content patterns
  for (const pattern of PASTED_CONTENT_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // Multi-line text with high technical line ratio
  const lines = text.split("\n");
  if (lines.length >= 5) {
    let techCount = 0;
    for (const line of lines) {
      if (line.trim().length > 0 && classifyLine(line) === "technical") {
        techCount++;
      }
    }
    if (techCount / lines.length > 0.5) return true;
  }

  return false;
}

/**
 * Classify assistant text into segments of narrative and technical content.
 * Adjacent lines of the same class are merged into segments.
 */
export function classifySegments(text: string): ClassifiedSegment[] {
  const lines = text.split("\n");
  const segments: ClassifiedSegment[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Track fenced code blocks
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      inCodeBlock = !inCodeBlock;
    }

    const classification: TextClass = inCodeBlock ? "technical" : classifyLine(line);

    const prev = segments[segments.length - 1];
    if (prev && prev.classification === classification) {
      prev.text += "\n" + line;
    } else {
      segments.push({ text: line, classification });
    }
  }

  return segments;
}
