import fs from "node:fs";
import path from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { addFact, createEntity, entityExists } from "./memory/para.js";
import { appendDaily, appendLongTerm, classifyMemory } from "./memory/journal.js";
import { getUserName, setUserName } from "./memory/profile.js";
import { search, searchFTSOnly, updateIndex } from "./memory/search.js";
import { generateSkill, isSkillRequest } from "./skills/skill-generator.js";
import type { EntityType } from "./memory/types.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { ENABLE_LEARNING, ENABLE_QMD, KNOWLEDGE_GAP_THRESHOLD } from "./config.js";
import { DAILY_DIR, LONG_TERM_PATH } from "./memory/paths.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
const SYSTEM_PROMPT_PATH = path.resolve(process.cwd(), "prompts", "system.md");
const MAX_PROMPT_CHARS = Number(process.env.COGITO_PROMPT_MAX_CHARS ?? 20000);

const AGENTS_PATH = path.resolve(process.cwd(), "AGENTS.md");
const USER_PATH = path.resolve(process.cwd(), "USER.md");
const SOUL_PATH = path.resolve(process.cwd(), "SOUL.md");
const IDENTITY_PATH = path.resolve(process.cwd(), "IDENTITY.md");
const TOOLS_PATH = path.resolve(process.cwd(), "TOOLS.md");
const MEMORY_PATH = LONG_TERM_PATH;

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

function extractText(message: AgentMessage | undefined): string {
  if (!message || typeof message !== "object" || !("content" in message)) {
    return "";
  }
  const content = (message as { content: Array<{ type: string; text?: string }> }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function hasRecallAfter(messages: AgentMessage[], index: number): boolean {
  for (let i = index + 1; i < messages.length; i += 1) {
    const msg = messages[i] as any;
    if (
      msg?.role === "user" &&
      (extractText(msg).startsWith("【記憶】") || extractText(msg).startsWith("【自律学習の結果】"))
    ) {
      return true;
    }
  }
  return false;
}

async function searchWithTimeout(
  query: string,
  timeoutMs: number
): Promise<Array<{ entity: string; snippet: string; source: string; score: number }>> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve([]);
    }, timeoutMs);

    searchFTSOnly(query, 5)
      .then((results) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(results);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve([]);
      });
  });
}

function formatRecallResults(results: Array<{ entity: string; snippet: string; source: string }>): string {
  if (results.length === 0) {
    return "関連する記憶は見つかりませんでした。";
  }
  return [
    "関連する記憶:",
    ...results.map((r, i) => `${i + 1}. ${r.entity}: ${r.snippet} (${r.source})`),
  ].join("\n");
}

function extractCriteriaFromResults(results: Array<{ entity: string; snippet: string }>): string[] {
  const criteria: string[] = [];
  for (const result of results) {
    if (!/decision-criteria/i.test(result.entity)) continue;
    const lines = result.snippet
      .split("\n")
      .map((line) => line.replace(/^[-*\\s\\d.]+/, "").trim())
      .filter(Boolean);
    for (const line of lines) {
      if (!criteria.includes(line)) {
        criteria.push(line);
      }
    }
  }
  return criteria.slice(0, 3);
}

type LearnedKnowledge = {
  topic: string;
  summary: string;
  facts: string[];
  sources: string[];
};

function formatLearned(learned: LearnedKnowledge): string {
  return [
    `トピック: ${learned.topic}`,
    learned.summary,
    "重要ポイント:",
    ...learned.facts.map((f) => `- ${f}`),
    learned.sources.length > 0 ? `Sources: ${learned.sources.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCriteria(criteria: string[]): string {
  if (criteria.length === 0) {
    return "";
  }
  return ["判断基準:", ...criteria.map((c, i) => `${i + 1}. ${c}`)].join("\n");
}

function buildSystemPrompt(): string {
  const basePrompt = readFileOrEmpty(SYSTEM_PROMPT_PATH);
  const sections = [
    section("AGENTS", readFileOrEmpty(AGENTS_PATH)),
    section("SOUL", readFileOrEmpty(SOUL_PATH)),
    section("IDENTITY", readFileOrEmpty(IDENTITY_PATH)),
    section("TOOLS", readFileOrEmpty(TOOLS_PATH)),
    section("USER", readFileOrEmpty(USER_PATH)),
    section("MEMORY", readFileOrEmpty(MEMORY_PATH)),
    section("DAILY (today)", readFileOrEmpty(getDailyPath(0))),
    section("DAILY (yesterday)", readFileOrEmpty(getDailyPath(1))),
  ].filter(Boolean);

  const profileName = getUserName();
  const profileBlock = profileName ? `## 利用者プロフィール\n- 名前: ${profileName}\n` : "";

  return [basePrompt, ...sections, profileBlock].filter(Boolean).join("\n\n");
}

function readFileOrEmpty(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (raw.length <= MAX_PROMPT_CHARS) return raw;
    return `${raw.slice(0, MAX_PROMPT_CHARS)}\n...(truncated)`;
  } catch {
    return "";
  }
}

function section(title: string, content: string): string {
  if (!content) return "";
  return `## ${title}\n${content}`;
}

function getDailyPath(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return path.join(DAILY_DIR, `${yyyy}-${mm}-${dd}.md`);
}

export function refreshSystemPrompt(agent: Agent): void {
  agent.setSystemPrompt(buildSystemPrompt());
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

export function buildBaseTools(): AgentTool[] {
  const rememberTool: AgentTool = {
    name: "remember",
    label: "remember",
    description: "重要な情報を構造化して記憶に保存する",
    parameters: Type.Object({
      content: Type.String({ minLength: 1, description: "記憶する内容" }),
      type: Type.Union(
        [
          Type.Literal("person"),
          Type.Literal("project"),
          Type.Literal("decision"),
          Type.Literal("fact"),
          Type.Literal("resource"),
        ],
        { description: "情報の種類" }
      ),
      entity: Type.Optional(
        Type.String({ description: "関連するエンティティ名（人物/プロジェクト）" })
      ),
    }),
    execute: async (_toolCallId, params) => {
      const { content, type, entity } = params as {
        content: string;
        type: EntityType;
        entity?: string;
      };
      if (type === "person" || type === "project") {
        const name = entity ?? content;
        if (!entityExists(type, name)) {
          createEntity(type, name, content);
        }
        addFact(type, name, content, "session");
        if (/ユーザー名|名前/.test(content)) {
          const match = content.match(/(?:ユーザー名|名前)は?\\s*([A-Za-z0-9_-]{2,})/i);
          if (match) {
            setUserName(match[1], "remember");
          }
        }
      } else {
        const resourceName = entity ?? "general";
        if (!entityExists("resource", resourceName)) {
          createEntity("resource", resourceName, "General memory bucket.");
        }
        addFact("resource", resourceName, content, "session");
      }
      if (classifyMemory(type) === "long") {
        appendLongTerm(content, "remember");
      } else {
        appendDaily(content, "remember");
      }
      await updateIndex();
      return {
        content: [{ type: "text", text: "saved" }],
        details: { saved: true, type, entity },
      };
    },
  };

  const recallTool: AgentTool = {
    name: "recall",
    label: "recall",
    description: "記憶を検索して関連情報を取得する",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, description: "検索クエリ" }),
      limit: Type.Optional(Type.Number({ default: 5 })),
    }),
    execute: async (_toolCallId, params) => {
      const { query, limit } = params as { query: string; limit?: number };
      const results = await search(query, limit ?? 5);
      return {
        content: [{ type: "text", text: JSON.stringify({ results }) }],
        details: { results },
      };
    },
  };

  return [rememberTool, recallTool];
}

export function setAgentTools(agent: Agent, extraTools: AgentTool[] = []): void {
  agent.setTools([...buildBaseTools(), ...extraTools]);
}

export function createAgent(): Agent {
  const systemPrompt = buildSystemPrompt();

  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);

  const agent = new Agent({
    transformContext: ENABLE_QMD || ENABLE_LEARNING
      ? async (messages, signal) => {
      const lastIndex = messages.length - 1;
      const last = messages[lastIndex];
      if (!last || last.role !== "user") {
        return messages;
      }
      if (hasRecallAfter(messages, lastIndex)) {
        return messages;
      }
      const query = extractText(last).trim();
      if (!query) {
        return messages;
      }
      if (isSkillRequest(query)) {
        const proposal = await generateSkill(query);
        if (proposal) {
          const note = proposal.applied
            ? `Generated: ${proposal.path}`
            : "Proposal only (set COGITO_ALLOW_SKILL_WRITE=1 to write).";
          return [
            ...messages,
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `【スキル案】\n${proposal.name}\n${proposal.description}\n${note}`,
                },
              ],
              timestamp: Date.now(),
            },
          ];
        }
      }

      let results: Array<{ entity: string; snippet: string; source: string; score: number }> = [];
      try {
        results = await searchWithTimeout(query, 1200);
      } catch {
        results = [];
      }

      const topScore = results[0]?.score ?? 0;
      if (results.length > 0 && (!ENABLE_LEARNING || topScore >= KNOWLEDGE_GAP_THRESHOLD)) {
        const criteria = extractCriteriaFromResults(results);
        const criteriaBlock = criteria.length > 0 ? `\n\n${formatCriteria(criteria)}` : "";
        return [
          ...messages,
          {
            role: "user",
            content: [{ type: "text", text: `【記憶】\n${formatRecallResults(results)}${criteriaBlock}` }],
            timestamp: Date.now(),
          },
        ];
      }

      if (!ENABLE_LEARNING) {
        return messages;
      }

      try {
        const { learnAutonomously } = await import("./extensions/autonomous-learning.js");
        const learned = await learnAutonomously(query);
        return [
          ...messages,
          {
            role: "user",
            content: [{ type: "text", text: `【自律学習の結果】\n${formatLearned(learned)}` }],
            timestamp: Date.now(),
          },
        ];
      } catch {
        return results.length > 0
          ? [
              ...messages,
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: (() => {
                      const criteria = extractCriteriaFromResults(results);
                      const criteriaBlock = criteria.length > 0 ? `\n\n${formatCriteria(criteria)}` : "";
                      return `【記憶】\n${formatRecallResults(results)}${criteriaBlock}`;
                    })(),
                  },
                ],
                timestamp: Date.now(),
              },
            ]
          : messages;
      }
    }
      : undefined,
  });
  agent.setSystemPrompt(systemPrompt);
  agent.setModel(getModel(provider, model));

  setAgentTools(agent);
  return agent;
}
