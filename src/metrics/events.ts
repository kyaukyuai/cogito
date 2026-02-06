import fs from "node:fs";
import path from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { KNOWLEDGE_DIR } from "../memory/paths.js";

export type TurnMetrics = {
  timestamp: string;
  mode: string;
  userText: string;
  assistantText: string;
  latencyMs: number;
  usedMemory: boolean;
  usedLearning: boolean;
  usedCriteria: boolean;
  usedSkillProposal: boolean;
};

const METRICS_DIR = path.join(KNOWLEDGE_DIR, "metrics");
const EVENTS_PATH = path.join(METRICS_DIR, "events.jsonl");

function ensureDir(): void {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function compact(text: string, max = 200): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
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

export function detectContextSignals(messages: AgentMessage[]): {
  usedMemory: boolean;
  usedLearning: boolean;
  usedCriteria: boolean;
} {
  const recentUsers = [...messages].reverse().filter((m) => m.role === "user").slice(0, 3);
  let usedMemory = false;
  let usedLearning = false;
  let usedCriteria = false;

  for (const msg of recentUsers) {
    const text = extractText(msg).trim();
    if (!text) continue;
    if (text.startsWith("【記憶】")) {
      usedMemory = true;
    }
    if (text.startsWith("【自律学習の結果】")) {
      usedLearning = true;
    }
    if (text.includes("判断基準:")) {
      usedCriteria = true;
    }
  }

  return { usedMemory, usedLearning, usedCriteria };
}

export function detectSkillProposal(text: string): boolean {
  const normalized = text.toLowerCase();
  return text.includes("【スキル案】") || normalized.includes("skill proposal");
}

export function recordTurnMetrics(event: TurnMetrics): void {
  ensureDir();
  const payload = {
    ...event,
    userText: compact(event.userText),
    assistantText: compact(event.assistantText),
  };
  fs.appendFileSync(EVENTS_PATH, `${JSON.stringify(payload)}\n`, "utf8");
}
