import { describe, it, expect } from "vitest";
import { parseLogContent, extractEvents } from "../parser.js";

const SAMPLE_LOG = `{"type":"message","timestamp":"2025-01-15T10:00:00.000Z","message":{"role":"user","content":"Hello"}}
{"type":"message","timestamp":"2025-01-15T10:00:01.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi there!"},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/app/test.ts"}}]}}
{"type":"message","timestamp":"2025-01-15T10:00:02.000Z","message":{"role":"assistant","content":[{"type":"tool_result","tool_use_id":"t1","content":"file contents here"}]}}`;

describe("parseLogContent", () => {
  it("should parse valid JSONL lines", () => {
    const entries = parseLogContent(SAMPLE_LOG);
    expect(entries).toHaveLength(3);
    expect(entries[0].type).toBe("message");
    expect(entries[0].message?.role).toBe("user");
  });

  it("should skip empty lines", () => {
    const entries = parseLogContent("  \n\n" + SAMPLE_LOG + "\n\n");
    expect(entries).toHaveLength(3);
  });

  it("should skip malformed lines", () => {
    const entries = parseLogContent("not json\n" + SAMPLE_LOG);
    expect(entries).toHaveLength(3);
  });

  it("should handle empty input", () => {
    const entries = parseLogContent("");
    expect(entries).toHaveLength(0);
  });
});

describe("extractEvents", () => {
  it("should extract events from log entries", () => {
    const entries = parseLogContent(SAMPLE_LOG);
    const events = extractEvents(entries);

    expect(events.length).toBeGreaterThanOrEqual(3);

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("user_message");
    expect(kinds).toContain("assistant_text");
    expect(kinds).toContain("tool_use");
    expect(kinds).toContain("tool_result");
  });

  it("should set tool name and caption for tool_use events", () => {
    const entries = parseLogContent(SAMPLE_LOG);
    const events = extractEvents(entries);
    const toolEvent = events.find((e) => e.kind === "tool_use");

    expect(toolEvent).toBeDefined();
    expect(toolEvent!.toolName).toBe("Read");
    expect(toolEvent!.caption).toContain("Reading");
  });

  it("should assign durations based on timestamp gaps", () => {
    const entries = parseLogContent(SAMPLE_LOG);
    const events = extractEvents(entries);

    // All events should have non-negative durations
    for (const event of events) {
      expect(event.duration).toBeGreaterThanOrEqual(0);
    }
  });

  it("should handle string content in user messages", () => {
    const log = `{"type":"message","timestamp":"2025-01-15T10:00:00.000Z","message":{"role":"user","content":"simple string message"}}`;
    const entries = parseLogContent(log);
    const events = extractEvents(entries);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("user_message");
    expect(events[0].text).toBe("simple string message");
  });

  it("should set baseTime from the first entry that has a timestamp", () => {
    // First entry has no timestamp (e.g. file-history-snapshot), second does
    const log = [
      `{"type":"file-history-snapshot","data":{}}`,
      `{"type":"message","timestamp":"2025-01-15T10:00:05.000Z","message":{"role":"user","content":"Hello"}}`,
      `{"type":"message","timestamp":"2025-01-15T10:00:08.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi"}]}}`,
    ].join("\n");

    const entries = parseLogContent(log);
    const events = extractEvents(entries);

    // The user_message should have timestamp 0 (it is the first entry with a timestamp)
    const userEvent = events.find((e) => e.kind === "user_message");
    expect(userEvent).toBeDefined();
    expect(userEvent!.timestamp).toBe(0);

    // The assistant_text should have timestamp = 3000ms (8s - 5s)
    const assistantEvent = events.find((e) => e.kind === "assistant_text");
    expect(assistantEvent).toBeDefined();
    expect(assistantEvent!.timestamp).toBe(3000);
  });

  it("should not leave baseTime at 0 when first entries lack timestamps", () => {
    // If baseTime stayed 0, the first real timestamp (10:00:05) would produce
    // a huge relative time instead of 0
    const log = [
      `{"type":"system","data":{}}`,
      `{"type":"system","data":{}}`,
      `{"type":"message","timestamp":"2025-01-15T10:00:05.000Z","message":{"role":"user","content":"Test"}}`,
    ].join("\n");

    const entries = parseLogContent(log);
    const events = extractEvents(entries);

    expect(events).toHaveLength(1);
    // First event with a timestamp should be at relative time 0, not a huge number
    expect(events[0].timestamp).toBe(0);
  });
});
