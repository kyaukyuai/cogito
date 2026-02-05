# Cogito

Cogito is a malleable personal agent with a tiny core (~2.1k LOC) and self-extending tools.

## Key Features

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

## Requirements

- Bun 1.x (QMD uses `bun:sqlite`)
- Node.js 20+ (tooling)

## Install

```bash
bun install
cp .env.example .env
# set ANTHROPIC_API_KEY in .env
```

## Docker (Recommended)

Run as a background service:

```bash
docker compose up -d --build
```

Data persistence:

- `knowledge/` is persisted as a volume
- `.qmd/` is persisted as a volume

Start an interactive CLI inside the container:

```bash
docker compose run --rm cogito-cli
```

Optional scheduler tuning:

- `COGITO_INDEX_REFRESH_MS` (default `900000` = 15 min)
- `COGITO_HEARTBEAT_MS` (default `0`, set to enable heartbeat logs)

## Local CLI (Development)

```bash
bun run src/index.ts
```

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

## Memory Model

**Long-term memory**: `knowledge/MEMORY.md`  
Store names, roles, decision criteria, and persistent facts.

**Daily memory**: `knowledge/memory/YYYY-MM-DD.md`  
Store daily conversation logs and short-lived events.

**Routing rule**:  
`person` / `project` / `decision` go to long-term memory. Everything else goes to daily memory.

## Profile and USER.md

`knowledge/profile.json` is the source of truth.  
`USER.md` is auto-generated from the profile and should not be edited manually.

## Skill Generation

Generated skills are written by default. To disable writing:

```bash
COGITO_MODE=learning COGITO_ALLOW_SKILL_WRITE=0 bun run src/index.ts
```

When a skill is generated, Cogito runs an automatic static review and (if it passes) auto-loads the tool into the agent for the current session. The review blocks filesystem, network, and dynamic code execution.

## Autonomous Learning

Enable autonomous learning (gap detection → web search → synthesis → save):

```bash
COGITO_MODE=learning BRAVE_API_KEY=... bun run src/index.ts
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

## Design Philosophy (Malleable Agent)

1. Self-extension over fixed features  
2. Use-based evolution is an aspiration  
3. Tiny core + safe, optional extensions  
4. Autonomous learning when enabled
