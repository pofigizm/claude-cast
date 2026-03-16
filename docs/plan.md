# claude-cast: Product Plan

## What it does

**Input:** Raw Claude Code JSONL log (stream-json format from `~/.claude/projects/*/logs/`)
**Output:** Screencast video showing how Claude worked — terminal-style rendering with captions

## Key Features

1. **JSONL Parsing** — Parse Claude Code log format, extract structured events: tool calls (Read, Write, Edit, Bash, Grep, Glob), assistant text, user messages
2. **Smart Acceleration** — Long pauses and uninteresting moments (large file reads, waiting) are compressed; actual actions shown at readable pace
3. **Action Captions** — Overlay showing what's happening ("Reading src/index.ts", "Editing config.json", "Running npm test")
4. **Terminal Render** — Realistic terminal appearance with colors, typed text effect for assistant messages
5. **Output Formats** — asciicast (for asciinema web player), GIF, MP4

## Technical Stack

- **Language:** TypeScript (Node.js)
- **CLI framework:** Commander.js
- **Output format:** asciicast v2 (native)
- **GIF/MP4 conversion:** agg (asciicast-to-gif) + ffmpeg (external tools, optional)
- **Testing:** vitest
- **Build:** tsup

## Architecture (Pipeline)

```
JSONL file
    |
    v
[1. Parser] — reads JSONL, extracts events with timestamps
    |
    v
[2. Timeline] — builds ordered event list with durations
    |
    v
[3. Compressor] — shrinks pauses, caps long outputs
    |
    v
[4. Renderer] — generates asciicast frames (terminal simulation)
    |
    v
[5. Overlay] — injects caption frames for tool actions
    |
    v
[6. Exporter] — writes .cast file; optionally converts to GIF/MP4
```

## MVP Scope

### In MVP
- JSONL parser for Claude Code log format
- Timeline with timestamps
- Pause compression (configurable max pause)
- Terminal-style asciicast renderer
- Action captions as terminal overlay (status bar)
- asciicast output (playable with asciinema-player)
- CLI with basic options (input, output, speed, format)
- GIF/MP4 via shelling out to agg/ffmpeg

### Out of MVP
- TTS / audio
- Syntax highlighting in code blocks
- Interactive web player bundle
- Custom themes
- Streaming / live mode
