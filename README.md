# Cogito

An AI agent (MVP) that learns and reproduces the user's thinking process.

## Design Philosophy: Malleable Agent

“Pi is the most interesting agent harness. Tiny core, able to write plugins for itself as you use it. It RLs itself into the agent you want.” “Dawn of the age of malleable software.” — Shopify CEO Tobi Lütke (2026-02-03)

Four design principles:

1. Self-extension over fixed features.
2. “I want this feature” → the agent implements it itself.
3. RL-like evolution with use.
4. Tiny core + self-extending system.

Autonomous learning loop:

1. Unknown → investigate.
2. Learn and store.
3. Answer better next time.

Trajectory:

1. Day 1: general assistant.
2. Day 100: a faithful clone of the target decision-maker.

## Requirements

- Bun 1.x (QMD relies on `bun:sqlite`)
- Node.js 20+ (tooling)

## Setup

```bash
bun install
cp .env.example .env
# set ANTHROPIC_API_KEY in .env
```

## Run

```bash
bun run src/index.ts
```

## Features

- CLI chat loop
- Structured memory via `remember`
- Memory-aware responses
- User profile (`knowledge/profile.json`) for stable name recall
- `USER.md` auto-sync from profile

## OpenClaw-Style Prompt Composition

The system prompt is built dynamically from these files:

- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `TOOLS.md`
- `USER.md`
- `knowledge/MEMORY.md`
- `knowledge/memory/YYYY-MM-DD.md` (today and yesterday)

You can limit injected size with `COGITO_PROMPT_MAX_CHARS`.

## Memory Storage Rules (OpenClaw-style)

Long-term memory file: `knowledge/MEMORY.md`.
Store names, roles, decision criteria, and persistent facts.

Daily memory file: `knowledge/memory/YYYY-MM-DD.md`.
Store daily conversation logs and short-lived events.

Routing rule:
`person` / `project` / `decision` go to long-term memory. Everything else goes to daily memory.

## Profile and USER.md

`knowledge/profile.json` is the source of truth.
`USER.md` is automatically synced from the profile.

## Session Consolidation (on exit)

Disabled by default for Bun stability. Enable with:

```bash
COGITO_ENABLE_CONSOLIDATE=1 bun run src/index.ts
```

## QMD / Realtime Extraction (stability-first)

Controls:

- QMD FTS is **ON by default**. Disable with `COGITO_ENABLE_QMD=0`.
- Realtime extraction is **ON by default**. Disable with `COGITO_ENABLE_REALTIME=0`.
- Embeddings (vector search) are **OFF by default**. Enable with `COGITO_ENABLE_EMBED=1`.

Example:

```bash
COGITO_ENABLE_EMBED=1 bun run src/index.ts
```

## Environment Variables

- `ANTHROPIC_API_KEY` (required)
- `COGITO_MODEL` (e.g. `anthropic/claude-sonnet-4-20250514`)
- `COGITO_PROMPT_MAX_CHARS`
- `COGITO_ENABLE_QMD` (`0` to disable)
- `COGITO_ENABLE_REALTIME` (`0` to disable)
- `COGITO_ENABLE_EMBED` (`1` to enable)
- `COGITO_ENABLE_CONSOLIDATE` (`1` to enable)
