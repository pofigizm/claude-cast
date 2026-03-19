import { readFileSync } from "fs";
import type { TimelineEvent } from "./types.js";

export type SecretsCheckMode = "warn" | "strict" | "off";

export interface SecretFinding {
  pattern: string;
  match: string;
  line: number;
  eventIndex: number;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API keys
  { name: "OpenAI API key", regex: /sk-[a-zA-Z0-9]{20,}/ },
  { name: "GitHub personal access token", regex: /ghp_[a-zA-Z0-9]{36,}/ },
  { name: "GitHub OAuth token", regex: /gho_[a-zA-Z0-9]{36,}/ },
  { name: "Slack token", regex: /xox[bpas]-[a-zA-Z0-9-]{10,}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },

  // JWT tokens (must have 2 dots and start with eyJ)
  { name: "JWT token", regex: /eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/ },

  // Authorization headers
  { name: "Bearer token", regex: /Bearer\s+[a-zA-Z0-9_\-.]{20,}/ },
  { name: "Authorization header", regex: /Authorization:\s*(?:Bearer|Basic|Token)\s+[a-zA-Z0-9_\-.+/=]{20,}/ },

  // Private keys
  { name: "Private key", regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/ },

  // Connection strings with credentials
  { name: "Connection string", regex: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^:]+:[^@]+@[^\s"']+/ },

  // Env var assignments with sensitive names
  { name: "Secret env var", regex: /(?:_SECRET|_TOKEN|_KEY|_PASSWORD|_CREDENTIAL)\s*=\s*["']?[^\s"']{8,}/ },
];

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * Scan text for potential secrets. Returns findings.
 */
export function scanText(text: string, eventIndex: number): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        findings.push({
          pattern: pattern.name,
          match: truncateMatch(match[0]),
          line: lineIdx + 1,
          eventIndex,
        });
      }
    }
  }

  return findings;
}

/**
 * Scan all timeline events for secrets.
 */
export function scanTimeline(events: TimelineEvent[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (let i = 0; i < events.length; i++) {
    if (events[i].text) {
      findings.push(...scanText(events[i].text, i));
    }
  }
  return findings;
}

/**
 * Redact secrets in a text string, replacing matches with [REDACTED].
 */
export function redactText(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.regex.source, "g"), REDACTED_PLACEHOLDER);
  }
  return result;
}

/**
 * Redact secrets in all timeline events (mutates events in place).
 */
export function redactTimeline(events: TimelineEvent[]): void {
  for (const event of events) {
    if (event.text) {
      event.text = redactText(event.text);
    }
  }
}

/**
 * Format findings as human-readable warnings.
 */
export function formatFindings(findings: SecretFinding[]): string {
  if (findings.length === 0) return "";
  const lines = [`WARNING: ${findings.length} potential secret(s) detected:\n`];
  for (const f of findings) {
    lines.push(`  - [event ${f.eventIndex}, line ${f.line}] ${f.pattern}: ${f.match}`);
  }
  return lines.join("\n");
}

/**
 * Truncate a matched secret for display (show prefix/suffix only).
 */
function truncateMatch(match: string): string {
  if (match.length <= 16) return match;
  return match.slice(0, 8) + "..." + match.slice(-4);
}

/**
 * Standalone check-secrets: scan a JSONL file and report findings.
 */
export function checkSecretsFile(filePath: string): SecretFinding[] {
  const content = readFileSync(filePath, "utf-8");
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    findings.push(...scanText(line, i));
  }

  return findings;
}
