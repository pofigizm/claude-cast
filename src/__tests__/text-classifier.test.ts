import { describe, it, expect } from "vitest";
import { classifyText, isPastedContent, classifySegments } from "../text-classifier.js";

describe("classifyText", () => {
  it("should classify prose as narrative", () => {
    const text = "This is a helpful explanation of how the code works. It describes the main function and its purpose.";
    expect(classifyText(text)).toBe("narrative");
  });

  it("should classify code as technical", () => {
    const text = `import { readFileSync } from "fs";
const data = readFileSync("file.txt", "utf-8");
export function parse(input: string): string[] {
  return input.split("\\n");
}`;
    expect(classifyText(text)).toBe("technical");
  });

  it("should classify JSON as technical", () => {
    const text = `{
  "name": "test",
  "version": "1.0.0",
  "dependencies": {
    "commander": "^12.0.0"
  }
}`;
    expect(classifyText(text)).toBe("technical");
  });

  it("should classify stack traces as technical", () => {
    const text = `Error: Something went wrong
    at Function.run (/app/src/cli.ts:42:15)
    at Object.<anonymous> (/app/src/index.ts:10:3)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)`;
    expect(classifyText(text)).toBe("technical");
  });

  it("should classify shell commands as technical", () => {
    const text = `$ npm install
$ npm run build
$ npm test`;
    expect(classifyText(text)).toBe("technical");
  });

  it("should classify empty text as narrative", () => {
    expect(classifyText("")).toBe("narrative");
  });

  it("should classify mixed text by majority", () => {
    const text = `Here is the explanation of the code.
It works by reading the file and parsing it.
This approach is simple and effective.
import { foo } from "bar";`;
    // 3 narrative vs 1 technical = narrative
    expect(classifyText(text)).toBe("narrative");
  });
});

describe("isPastedContent", () => {
  it("should detect pasted error messages", () => {
    const text = `Error: ENOENT: no such file or directory, open '/app/missing.ts'
    at Object.openSync (node:fs:603:3)
    at Object.readFileSync (node:fs:471:35)
    at parseLogFile (/app/src/parser.ts:8:26)
    at convertLog (/app/src/index.ts:28:21)`;
    expect(isPastedContent(text)).toBe(true);
  });

  it("should not flag short typed messages", () => {
    expect(isPastedContent("Fix the bug in parser.ts")).toBe(false);
  });

  it("should not flag medium-length prose", () => {
    expect(isPastedContent("Can you help me understand how the compressor works?")).toBe(false);
  });

  it("should detect pasted log output", () => {
    const text = `2024-01-15T10:00:00.000Z INFO Starting server
2024-01-15T10:00:01.000Z INFO Connected to database
2024-01-15T10:00:02.000Z ERROR Failed to bind port 3000
2024-01-15T10:00:02.500Z ERROR EACCES: permission denied
2024-01-15T10:00:03.000Z INFO Shutting down`;
    expect(isPastedContent(text)).toBe(true);
  });

  it("should detect pasted code blocks", () => {
    const text = `import { readFileSync } from "fs";
const data = readFileSync("file.txt", "utf-8");
export function parse(input: string): string[] {
  return input.split("\\n");
}
export default parse;`;
    expect(isPastedContent(text)).toBe(true);
  });
});

describe("classifySegments", () => {
  it("should split text into narrative and technical segments", () => {
    const text = `Here is my explanation.
This is how it works.
\`\`\`
const x = 1;
const y = 2;
\`\`\`
And that is the result.`;
    const segments = classifySegments(text);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    // Should have at least one narrative and one technical segment
    const types = segments.map((s) => s.classification);
    expect(types).toContain("narrative");
    expect(types).toContain("technical");
  });

  it("should handle all-narrative text", () => {
    const text = "This is a simple explanation.\nIt has two lines.";
    const segments = classifySegments(text);
    expect(segments.every((s) => s.classification === "narrative")).toBe(true);
  });

  it("should handle all-technical text", () => {
    const text = `import foo from "bar";
const x = 1;
export default x;`;
    const segments = classifySegments(text);
    expect(segments.every((s) => s.classification === "technical")).toBe(true);
  });
});
