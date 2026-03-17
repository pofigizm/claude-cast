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
  .option("-s, --speed <number>", "Playback speed multiplier", parseFloat, 2)
  .option("--max-pause <seconds>", "Maximum pause duration in seconds", parseFloat, 4)
  .option("--width <cols>", "Terminal width", parseInt, 120)
  .option("--height <rows>", "Terminal height", parseInt, 40)
  .option("--typing-speed <cps>", "Typing speed (chars/sec, fallback)", parseInt, 80)
  .option("--user-typing-speed <cps>", "User message typing speed (chars/sec)", parseInt)
  .option("--agent-speed <cps>", "Agent tool_use/tool_result speed (chars/sec)", parseInt)
  .option("--response-typing-speed <cps>", "Assistant response typing speed (chars/sec)", parseInt)
  .option("--response-pause <seconds>", "Pause after assistant response (seconds)", parseFloat)
  .option("--pre-user-pause <seconds>", "Pause before user input (seconds)", parseFloat)
  .option("--captions", "Enable action captions (disabled by default)")
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
      showCaptions: opts.captions === true,
      format: detectedFormat,
    };

    if (opts.userTypingSpeed != null) config.userTypingSpeed = opts.userTypingSpeed as number;
    if (opts.agentSpeed != null) config.agentSpeed = opts.agentSpeed as number;
    if (opts.responseTypingSpeed != null) config.responseTypingSpeed = opts.responseTypingSpeed as number;
    if (opts.responsePause != null) config.responsePause = opts.responsePause as number;
    if (opts.preUserPause != null) config.preUserPause = opts.preUserPause as number;

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
