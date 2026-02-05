# Cogito 🧠

> "Pi is the most interesting agent harness. Tiny core, able to write plugins for itself as you use it. It RLs itself into the agent you want."  
> "Dawn of the age of malleable software."  
> — Tobi Lütke, CEO Shopify (2026-02-03)

Cogito is a malleable personal agent with a tiny core (~2.1k LOC) and self-extending tools.
It learns your decision patterns via structured memory and can grow new tools through use.

## What is Cogito?

Cogito is an MVP personal agent focused on memory, retrieval, and self-extension.
It turns repeated decisions into structured memory and uses that memory to answer consistently.

Demo (CLI example):

```text
You: My name is Alex. Remember it.
Assistant: Got it. I will remember that your name is Alex.

You: Who am I?
Assistant: You are Alex.

You: I want a meeting minutes summary tool. Build it.
Assistant: 【Skill Proposal】...
```

## Quick Start (30 seconds)

```bash
cp .env.example .env
# set ANTHROPIC_API_KEY in .env

docker compose up -d --build
docker compose run --rm cogito-cli
```

## Philosophy (Malleable Agent)

1. Self-extension over fixed features.
2. Use-based evolution is an aspiration.
3. Tiny core + safe, optional extensions.
4. Autonomous learning when enabled.

## Features

- Tiny core with self-extending tools (skill generation + review + auto-load)
- Structured memory with PARA + QMD search (FTS by default, embeddings optional)
- Memory-aware responses (`remember` / `recall`)
- Optional autonomous learning (Brave Search integration)
- User profile memory (`knowledge/profile.json`)

## Architecture

```
User -> CLI -> Pi Agent -> LLM
             |-> remember -> knowledge/ (PARA) -> QMD index
             |-> recall   -> QMD search -> context injection
             |-> skills   -> generate / review / auto-load
```

PARA layout:

```
knowledge/
  projects/
  areas/people/
  resources/
  archives/
  MEMORY.md
  memory/YYYY-MM-DD.md
```

## Memory Model

Long-term memory: `knowledge/MEMORY.md`  
Store names, roles, decision criteria, and persistent facts.

Daily memory: `knowledge/memory/YYYY-MM-DD.md`  
Store daily conversation logs and short-lived events.

Routing rule:  
`person` / `project` / `decision` go to long-term memory. Everything else goes to daily memory.

## Modes

`COGITO_MODE` is the main switch (default: `full`).

- `stable`: QMD FTS + realtime extraction, no embeddings, no consolidation, no autonomous learning
- `learning`: `stable` + autonomous learning + skill proposals
- `full`: `learning` + embeddings + consolidation on exit

Examples:

```bash
COGITO_MODE=learning BRAVE_API_KEY=... bun run src/index.ts
COGITO_MODE=full BRAVE_API_KEY=... bun run src/index.ts
```

## Configuration

Main variables:

- `ANTHROPIC_API_KEY` (required)
- `BRAVE_API_KEY` (required for autonomous learning)
- `COGITO_MODE` (`stable` | `learning` | `full`)
- `COGITO_MODEL` (e.g. `anthropic/claude-sonnet-4-20250514`)
- `COGITO_PROMPT_MAX_CHARS`
- `COGITO_KNOWLEDGE_GAP_THRESHOLD`
- `COGITO_ALLOW_SKILL_WRITE` (`1` by default; set `0` to disable writes)
- `COGITO_PASTE_DEBOUNCE_MS` (default `60`)
- `COGITO_INDEX_REFRESH_MS` (default `900000`)
- `COGITO_HEARTBEAT_MS` (default `0`)

Advanced overrides (prefer `COGITO_MODE`):

- `COGITO_ENABLE_QMD`
- `COGITO_ENABLE_REALTIME`
- `COGITO_ENABLE_EMBED`
- `COGITO_ENABLE_CONSOLIDATE`
- `COGITO_ENABLE_LEARNING`
- `COGITO_ENABLE_SKILL_GEN`

## Docker (Recommended)

Run as a background service:

```bash
docker compose up -d --build
```

Start an interactive CLI inside the container:

```bash
docker compose run --rm cogito-cli
```

Data persistence:

- `knowledge/` is persisted as a volume
- `.qmd/` is persisted as a volume

## Local CLI (Development)

```bash
bun run src/index.ts
```

## Project Structure

```
.
├── src/
│   ├── agent.ts          # Agent configuration
│   ├── index.ts          # CLI entry
│   ├── cli/              # CLI loop + input buffering
│   ├── memory/           # PARA, search, profile, journal, criteria
│   └── skills/           # generator, review, loader, runtime
├── prompts/              # system prompt
├── knowledge/            # PARA memory store
├── qmd.yaml              # QMD config
└── .env.example
```
