import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";
import { convertLog } from "../index.js";

const SAMPLE_LOG = resolve(import.meta.dirname, "../../examples/sample.jsonl");
const OUTPUT_PATH = resolve(import.meta.dirname, "../../test-output.cast");

describe("convertLog integration", () => {
  it("should convert sample log to .cast file", () => {
    // Clean up
    if (existsSync(OUTPUT_PATH)) unlinkSync(OUTPUT_PATH);

    convertLog(SAMPLE_LOG, OUTPUT_PATH, { format: "cast" });

    expect(existsSync(OUTPUT_PATH)).toBe(true);

    const content = readFileSync(OUTPUT_PATH, "utf-8");
    const lines = content.trim().split("\n");

    // First line should be the header
    const header = JSON.parse(lines[0]);
    expect(header.version).toBe(2);
    expect(header.width).toBe(120);
    expect(header.height).toBe(40);

    // Remaining lines should be events [time, type, data]
    for (let i = 1; i < lines.length; i++) {
      const event = JSON.parse(lines[i]);
      expect(Array.isArray(event)).toBe(true);
      expect(event).toHaveLength(3);
      expect(typeof event[0]).toBe("number");
      expect(event[1]).toBe("o");
      expect(typeof event[2]).toBe("string");
    }

    // Should have a reasonable number of frames
    expect(lines.length).toBeGreaterThan(10);

    // Clean up
    unlinkSync(OUTPUT_PATH);
  });

  it("should throw on empty input", () => {
    expect(() => convertLog("/nonexistent/file.jsonl", OUTPUT_PATH)).toThrow();
  });
});
