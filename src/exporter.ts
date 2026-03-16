import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";
import type { AsciicastHeader, AsciicastEvent, CastConfig } from "./types.js";

/**
 * Export asciicast data to a .cast file.
 */
export function exportCast(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  outputPath: string
): void {
  const lines: string[] = [JSON.stringify(header)];
  for (const event of events) {
    lines.push(JSON.stringify(event));
  }
  writeFileSync(outputPath, lines.join("\n") + "\n", "utf-8");
}

/**
 * Convert a .cast file to GIF using agg.
 */
export function castToGif(castPath: string, gifPath: string): void {
  const abs = resolve(castPath);
  const out = resolve(gifPath);
  try {
    execSync(`agg "${abs}" "${out}"`, { stdio: "pipe" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to convert to GIF. Make sure 'agg' is installed (cargo install agg).\n${msg}`
    );
  }
}

/**
 * Convert a .cast file to MP4 using agg + ffmpeg.
 */
export function castToMp4(castPath: string, mp4Path: string): void {
  const abs = resolve(castPath);
  const out = resolve(mp4Path);
  const tmpGif = out.replace(/\.mp4$/, ".tmp.gif");
  try {
    execSync(`agg "${abs}" "${tmpGif}"`, { stdio: "pipe" });
    execSync(
      `ffmpeg -y -i "${tmpGif}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${out}"`,
      { stdio: "pipe" }
    );
    execSync(`rm -f "${tmpGif}"`, { stdio: "pipe" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to convert to MP4. Make sure 'agg' and 'ffmpeg' are installed.\n${msg}`
    );
  }
}

/**
 * Export in the requested format.
 */
export function exportOutput(
  header: AsciicastHeader,
  events: AsciicastEvent[],
  outputPath: string,
  config: CastConfig
): void {
  // Always write the .cast file first
  const castPath =
    config.format === "cast" ? outputPath : outputPath.replace(/\.[^.]+$/, ".cast");

  exportCast(header, events, castPath);

  if (config.format === "gif") {
    castToGif(castPath, outputPath);
    if (castPath !== outputPath) {
      // clean up intermediate cast file? keep it for now
    }
  } else if (config.format === "mp4") {
    castToMp4(castPath, outputPath);
  }
}
