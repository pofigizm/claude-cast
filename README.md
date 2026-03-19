# claude-cast

🇷🇺 [Читать на русском](README.ru.md)

Convert Claude Code JSONL logs into terminal screencasts.

Takes a raw Claude Code session log and produces a realistic terminal screencast showing how Claude worked — with tool calls, file edits, bash commands, and action captions.

## Demo

Play the included demo screencast to see claude-cast in action:

```bash
# Generate the demo from JSONL source
npx claude-cast examples/demo.jsonl -o examples/demo.cast

# Play it
asciinema play examples/demo.cast
```

The demo shows a typical Claude Code session: searching for TODOs, reading files, editing code, running tests, and committing — all rendered as a realistic terminal screencast.

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
| `-s, --speed <n>` | `2` | Playback speed multiplier |
| `--max-pause <sec>` | `4` | Maximum pause duration (seconds) |
| `--width <cols>` | `120` | Terminal width |
| `--height <rows>` | `40` | Terminal height |
| `--typing-speed <cps>` | `80` | Simulated typing speed — fallback (chars/sec) |
| `--user-typing-speed <cps>` | `25` | User message typing speed (chars/sec) |
| `--agent-speed <cps>` | `800` | Agent tool_use/tool_result speed (chars/sec) |
| `--response-typing-speed <cps>` | `75` | Assistant response typing speed (chars/sec) |
| `--response-pause <sec>` | `5` | Pause after assistant response (seconds) |
| `--pre-user-pause <sec>` | `4` | Pause before user input (seconds) |
| `--captions` | `false` | Enable action captions (disabled by default) |

### Per-phase timing

Different phases of a Claude session play at different speeds for a more natural viewing experience:

| Phase | Description | Default |
|-------|-------------|---------|
| User typing | Word-by-word — viewer reads the prompt | 25 cps |
| Agent working | Fast line-by-line scroll through tool chains | 800 cps |
| Assistant text | Word-by-word readable response stream | 75 cps |
| Response pause | Breathing room after assistant response | 5s |
| Pre-user pause | Pause before next user input | 4s |

User messages and assistant responses render **word-by-word** for a natural typing feel. Tool output (bash results, file contents) stays **line-by-line** since it's machine output.

When per-phase options are not specified, `--typing-speed` is used as the fallback for all phases.

### Why these defaults work

The defaults are tuned to produce a tight, watchable screencast out of the box:

- **`--speed 2`** — 2x global speedup compresses overall tempo so bash/tool output flies by, while user input and assistant responses get breathing room from per-phase speeds
- **`--user-typing-speed 25`** — user prompts appear word-by-word at a slow pace so the viewer can read them
- **`--agent-speed 800`** — tool calls and results scroll by fast; the viewer doesn't need to read every line, just see activity
- **`--response-typing-speed 75`** — Claude's replies stream word-by-word at a comfortable reading pace
- **`--response-pause 5`** — gives a visible pause after user input so the viewer can read the prompt before agent starts working
- **`--pre-user-pause 4`** — pause before the next user input so the viewer can absorb the agent's response
- **`--max-pause 4`** — caps dead time so the recording never stalls

To override, pass any option on the command line:

```bash
# Slower, more relaxed pacing
npx claude-cast input.jsonl -o output.cast --speed 1 --user-typing-speed 15

# Faster demo pace
npx claude-cast input.jsonl -o output.cast --speed 3 --pre-user-pause 3
```

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
