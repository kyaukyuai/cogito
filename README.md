# Cogito

An AI agent (MVP) designed to learn and approximate the user's thinking process.

## Design Philosophy: Malleable Agent

“Pi is the most interesting agent harness. Tiny core, able to write plugins for itself as you use it. It RLs itself into the agent you want.” “Dawn of the age of malleable software.” — Shopify CEO Tobi Lütke (2026-02-03)

Four design principles:

1. Self-extension over fixed features.
2. “I want this feature” → the agent can propose or implement it.
3. RL-like evolution with use (aspirational).
4. Tiny core + self-extending system (where safe).

Autonomous learning loop:

1. Unknown → investigate.
2. Learn and store (when enabled).
3. Answer better next time (best effort).

Trajectory:

1. Day 1: general assistant.
2. Day 100: closer approximation of the target decision-maker.

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

## Modes (Simplified)

Set `COGITO_MODE` to control features as a single switch. Default is `full`:

- `stable`: QMD FTS + realtime extraction, no embeddings, no consolidation, no autonomous learning
- `learning`: `stable` + autonomous learning + skill proposals
- `full`: `learning` + embeddings + consolidation on exit

Examples:

```bash
COGITO_MODE=learning BRAVE_API_KEY=... bun run src/index.ts
COGITO_MODE=full BRAVE_API_KEY=... bun run src/index.ts
```

## Features

- CLI chat loop
- Structured memory via `remember`
- Memory-aware responses
- User profile (`knowledge/profile.json`) for more stable name recall
- `USER.md` auto-synced from profile (generated file)

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
`USER.md` is auto-generated from the profile and should not be edited manually.

## Session Consolidation (on exit)

Disabled by default in `stable` mode for Bun stability. Enable by switching to `full`:

```bash
COGITO_MODE=full bun run src/index.ts
```

## QMD / Realtime Extraction (stability-first)

QMD FTS and realtime extraction are ON in all modes. Embeddings are only enabled in `full`.

## Autonomous Learning (Phase 4)

Enable autonomous learning (gap detection → web search → synthesis → save) in `learning` or `full`:

```bash
COGITO_MODE=learning BRAVE_API_KEY=... bun run src/index.ts
```

Generated skills are written by default. To disable writing:

```bash
COGITO_MODE=learning COGITO_ALLOW_SKILL_WRITE=0 bun run src/index.ts
```

When a skill is generated, Cogito runs an automatic static review and (if it passes) auto-loads the tool into the agent for the current session. The review blocks filesystem, network, and dynamic code execution.

## Environment Variables

- `ANTHROPIC_API_KEY` (required)
- `BRAVE_API_KEY` (required for autonomous learning)
- `COGITO_MODEL` (e.g. `anthropic/claude-sonnet-4-20250514`)
- `COGITO_PROMPT_MAX_CHARS`
- `COGITO_MODE` (`stable` | `learning` | `full`)
- `COGITO_KNOWLEDGE_GAP_THRESHOLD` (e.g. `0.7`)
- `COGITO_ALLOW_SKILL_WRITE` (`1` by default; set `0` to disable writes)

Advanced overrides (prefer `COGITO_MODE`):

- `COGITO_ENABLE_QMD`
- `COGITO_ENABLE_REALTIME`
- `COGITO_ENABLE_EMBED`
- `COGITO_ENABLE_CONSOLIDATE`
- `COGITO_ENABLE_LEARNING`
- `COGITO_ENABLE_SKILL_GEN`
