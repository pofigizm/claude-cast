# claude-cast

Convert Claude Code JSONL logs into terminal screencasts.

Takes a raw Claude Code session log and produces a realistic terminal screencast showing how Claude worked — with tool calls, file edits, bash commands, and action captions.

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# Basic: JSONL → asciicast
npx claude-cast input.jsonl -o output.cast

# With options
npx claude-cast input.jsonl -o output.cast --speed 2 --max-pause 5

# Output as GIF (requires agg: cargo install agg)
npx claude-cast input.jsonl -o output.gif

# Output as MP4 (requires agg + ffmpeg)
npx claude-cast input.jsonl -o output.mp4
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <path>` | `output.cast` | Output file path |
| `-f, --format <fmt>` | `cast` | Output format: `cast`, `gif`, `mp4` |
| `-s, --speed <n>` | `1` | Playback speed multiplier |
| `--max-pause <sec>` | `3` | Maximum pause duration (seconds) |
| `--width <cols>` | `120` | Terminal width |
| `--height <rows>` | `40` | Terminal height |
| `--typing-speed <cps>` | `80` | Simulated typing speed — fallback (chars/sec) |
| `--user-typing-speed <cps>` | | User message typing speed (chars/sec) |
| `--agent-speed <cps>` | | Agent tool_use/tool_result speed (chars/sec) |
| `--response-typing-speed <cps>` | | Assistant response typing speed (chars/sec) |
| `--response-pause <sec>` | | Pause after assistant response (seconds) |
| `--no-captions` | | Disable action captions |

### Per-phase timing

Different phases of a Claude session play at different speeds for a more natural viewing experience:

| Phase | Description | Suggested speed |
|-------|-------------|-----------------|
| User typing | Slow — viewer reads the prompt | ~30 cps |
| Agent working | Fast scroll through tool chains | ~500 cps |
| Assistant text | Readable response output | ~60 cps |
| Response pause | Breathing room before next turn | ~2s |

Example:
```bash
npx claude-cast input.jsonl -o output.cast \
  --user-typing-speed 30 \
  --agent-speed 500 \
  --response-typing-speed 60 \
  --response-pause 2
```

When per-phase options are not specified, `--typing-speed` is used as the fallback for all phases.

## Playing the output

```bash
# With asciinema
asciinema play output.cast

# Or upload to asciinema.org for a web player
asciinema upload output.cast
```

## Where to find Claude Code logs

Claude Code logs are stored in `~/.claude/projects/*/logs/`. Each session produces a JSONL file with timestamped message entries.

## Pipeline

1. **Parser** — reads JSONL log, extracts structured events (tool calls, text, results)
2. **Timeline** — builds ordered event list, merges adjacent text blocks
3. **Compressor** — caps long pauses, truncates large outputs, applies speed
4. **Renderer** — generates asciicast v2 frames with terminal styling and captions
5. **Exporter** — writes `.cast` file; optionally converts to GIF/MP4

## Development

```bash
# Run in dev mode
npx tsx src/cli.ts examples/sample.jsonl -o output.cast

# Run tests
npm test

# Build
npm run build
```

## Example

```bash
npx claude-cast examples/sample.jsonl -o demo.cast
asciinema play demo.cast
```

## Output formats

- **`.cast`** (asciicast v2) — native format, playable with `asciinema play` or web player. No external dependencies.
- **`.gif`** — requires [agg](https://github.com/asciinema/agg) (`cargo install agg`)
- **`.mp4`** — requires agg + [ffmpeg](https://ffmpeg.org/)

## License

MIT
