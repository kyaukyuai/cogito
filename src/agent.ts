import fs from "node:fs";
import path from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { formatMemoriesForContext, loadMemories, saveMemory } from "./memory.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
const SYSTEM_PROMPT_PATH = path.resolve(process.cwd(), "prompts", "system.md");

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

export function getRequiredApiKey(provider: string): string | null {
  const keyMap: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };
  const envKey = keyMap[provider];
  if (!envKey) {
    return null;
  }
  return envKey;
}

export function createAgent(): Agent {
  const basePrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8").trim();
  const memories = loadMemories();
  const memoryContext = formatMemoriesForContext(memories);
  const systemPrompt = `${basePrompt}\n\n${memoryContext}`;

  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);

  const agent = new Agent();
  agent.setSystemPrompt(systemPrompt);
  agent.setModel(getModel(provider, model));

  const rememberTool: AgentTool = {
    name: "remember",
    label: "remember",
    description: "重要な情報を記憶に保存する",
    parameters: Type.Object({
      content: Type.String({ minLength: 1 }),
    }),
    execute: async ({ content }) => {
      saveMemory(content);
      return { saved: true };
    },
  };

  agent.setTools([rememberTool]);
  return agent;
}
