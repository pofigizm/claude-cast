import { Command } from "commander";
import { convertLog } from "./index.js";
import type { CastConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const program = new Command();

program
  .name("claude-cast")
  .description("Convert Claude Code JSONL logs into terminal screencasts")
  .version("0.1.0")
  .argument("<input>", "Path to Claude Code JSONL log file")
  .option("-o, --output <path>", "Output file path", "output.cast")
  .option("-f, --format <format>", "Output format: cast, gif, mp4", "cast")
  .option("-s, --speed <number>", "Playback speed multiplier", parseFloat, 1)
  .option("--max-pause <seconds>", "Maximum pause duration in seconds", parseFloat, 3)
  .option("--width <cols>", "Terminal width", parseInt, 120)
  .option("--height <rows>", "Terminal height", parseInt, 40)
  .option("--typing-speed <cps>", "Typing speed (chars/sec)", parseInt, 80)
  .option("--no-captions", "Disable action captions")
  .action((input: string, opts: Record<string, unknown>) => {
    const format = opts.format as CastConfig["format"];
    if (!["cast", "gif", "mp4"].includes(format)) {
      console.error(`Error: unsupported format "${format}". Use cast, gif, or mp4.`);
      process.exit(1);
    }

    // Auto-detect format from output extension if not explicitly set
    let outputPath = opts.output as string;
    const detectedFormat = detectFormat(outputPath, format);

    const config: Partial<CastConfig> = {
      speed: opts.speed as number,
      maxPause: opts.maxPause as number,
      width: opts.width as number,
      height: opts.height as number,
      typingSpeed: opts.typingSpeed as number,
      showCaptions: opts.captions !== false,
      format: detectedFormat,
    };

    console.log(`claude-cast: converting ${input} → ${outputPath}`);
    console.log(`  format: ${detectedFormat}, speed: ${config.speed}x, max-pause: ${config.maxPause}s`);

    try {
      convertLog(input, outputPath, config);
      console.log(`Done! Output: ${outputPath}`);
      if (detectedFormat === "cast") {
        console.log(`\nPlay with: asciinema play ${outputPath}`);
        console.log(`Or use the web player: https://asciinema.org/`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${msg}`);
      process.exit(1);
    }
  });

function detectFormat(outputPath: string, explicitFormat: string): CastConfig["format"] {
  if (explicitFormat !== "cast") return explicitFormat as CastConfig["format"];
  if (outputPath.endsWith(".gif")) return "gif";
  if (outputPath.endsWith(".mp4")) return "mp4";
  return "cast";
}

program.parse();
