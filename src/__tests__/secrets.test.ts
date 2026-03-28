import { describe, it, expect } from "vitest";
import { scanText, scanTimeline, redactText, redactTimeline, formatFindings } from "../secrets.js";
import type { TimelineEvent } from "../types.js";

function makeEvent(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    kind: "assistant_text",
    timestamp: 0,
    duration: 1000,
    text: "test output",
    ...overrides,
  };
}

describe("scanText", () => {
  it("should detect OpenAI API keys", () => {
    const findings = scanText("my key is sk-abcdefghijklmnopqrstuvwxyz1234567890", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("OpenAI API key");
  });

  it("should detect GitHub tokens", () => {
    const findings = scanText("token: ghp_abcdefghijklmnopqrstuvwxyz1234567890AB", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("GitHub personal access token");
  });

  it("should detect AWS access keys", () => {
    const findings = scanText("AKIAIOSFODNN7EXAMPLE", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("AWS access key");
  });

  it("should detect private keys", () => {
    const findings = scanText("-----BEGIN RSA PRIVATE KEY-----", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("Private key");
  });

  it("should detect connection strings with credentials", () => {
    const findings = scanText("mongodb://admin:p4ssw0rd@localhost:27017/db", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("Connection string");
  });

  it("should detect Bearer tokens", () => {
    const findings = scanText("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", 0);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("should detect secret env vars", () => {
    const findings = scanText("DATABASE_PASSWORD=supersecretvalue123", 0);
    expect(findings.length).toBe(1);
    expect(findings[0].pattern).toBe("Secret env var");
  });

  it("should not flag normal text", () => {
    const findings = scanText("This is a normal assistant response about coding.", 0);
    expect(findings.length).toBe(0);
  });

  it("should not flag short strings that look like key prefixes", () => {
    const findings = scanText("sk-short", 0);
    expect(findings.length).toBe(0);
  });
});

describe("scanTimeline", () => {
  it("should scan all events", () => {
    const events = [
      makeEvent({ text: "safe text" }),
      makeEvent({ text: "key: sk-abcdefghijklmnopqrstuvwxyz1234567890" }),
      makeEvent({ text: "more safe text" }),
    ];
    const findings = scanTimeline(events);
    expect(findings.length).toBe(1);
    expect(findings[0].eventIndex).toBe(1);
  });
});

describe("redactText", () => {
  it("should replace secrets with [REDACTED]", () => {
    const text = "my key is sk-abcdefghijklmnopqrstuvwxyz1234567890";
    const redacted = redactText(text);
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz1234567890");
  });

  it("should leave normal text unchanged", () => {
    const text = "This is normal text.";
    expect(redactText(text)).toBe(text);
  });
});

describe("redactTimeline", () => {
  it("should redact secrets in all events", () => {
    const events = [
      makeEvent({ text: "key: sk-abcdefghijklmnopqrstuvwxyz1234567890" }),
    ];
    redactTimeline(events);
    expect(events[0].text).toContain("[REDACTED]");
  });
});

describe("formatFindings", () => {
  it("should return empty string for no findings", () => {
    expect(formatFindings([])).toBe("");
  });

  it("should format findings as warnings", () => {
    const findings = [{ pattern: "OpenAI API key", match: "sk-abc...7890", line: 1, eventIndex: 0 }];
    const output = formatFindings(findings);
    expect(output).toContain("WARNING");
    expect(output).toContain("OpenAI API key");
  });
});
