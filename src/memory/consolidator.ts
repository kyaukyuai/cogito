import { completeSimple, getModel } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { addFact, addRelation, createEntity, entityExists, supersedeFact } from "./para.js";
import { appendDaily, appendLongTerm, classifyMemory } from "./journal.js";
import { updateIndex } from "./search.js";
import type { EntityType } from "./types.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

type ConsolidationResult = {
  newEntities?: Array<{ type: EntityType; name: string; summary: string }>;
  newFacts?: Array<{ entityType: EntityType; entityName: string; fact: string }>;
  relations?: Array<{ from: string; to: string; relation: string }>;
  superseded?: Array<{
    entityType: EntityType;
    entityName: string;
    oldFactId: string;
    newFact: string;
  }>;
};

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

function extractText(message: AgentMessage): string {
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

function formatHistory(messages: AgentMessage[]): string {
  return messages
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      return `${role}: ${extractText(msg)}`;
    })
    .join("\n");
}

function coerceJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return "{}";
}

export async function consolidateSession(messages: AgentMessage[]): Promise<void> {
  const prompt = `以下の会話セッション全体を分析し、記憶を整理してください。\n\n## タスク\n1. 重要情報の抽出漏れがないか確認\n2. 関連する記憶同士を紐付け\n3. 矛盾する情報があれば最新を優先\n4. コンテキストを補完（「彼」→ 具体的な人物名など）\n\n## 会話履歴\n${formatHistory(messages)}\n\n## 出力形式（JSON）\n{\n  "newEntities": [{ "type": "...", "name": "...", "summary": "..." }],\n  "newFacts": [{ "entityType": "...", "entityName": "...", "fact": "..." }],\n  "relations": [{ "from": "...", "to": "...", "relation": "..." }],\n  "superseded": [{ "entityType": "...", "entityName": "...", "oldFactId": "...", "newFact": "..." }]\n}\n`;

  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);
  const llm = getModel(provider, model);

  const response = await completeSimple(llm, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  const json = coerceJson(text);
  const parsed = JSON.parse(json) as ConsolidationResult;

  if (parsed.newEntities) {
    for (const entity of parsed.newEntities) {
      if (!entityExists(entity.type, entity.name)) {
        createEntity(entity.type, entity.name, entity.summary);
      }
      if (classifyMemory(entity.type) === "long") {
        appendLongTerm(entity.summary, "consolidation");
      } else {
        appendDaily(entity.summary, "consolidation");
      }
    }
  }

  if (parsed.newFacts) {
    for (const fact of parsed.newFacts) {
      if (!entityExists(fact.entityType, fact.entityName)) {
        createEntity(fact.entityType, fact.entityName, fact.fact);
      }
      addFact(fact.entityType, fact.entityName, fact.fact, "consolidation");
      if (classifyMemory(fact.entityType) === "long") {
        appendLongTerm(fact.fact, "consolidation");
      } else {
        appendDaily(fact.fact, "consolidation");
      }
    }
  }

  if (parsed.relations) {
    for (const rel of parsed.relations) {
      addRelation("resource", rel.from, `${rel.relation}: ${rel.to}`);
    }
  }

  if (parsed.superseded) {
    for (const sup of parsed.superseded) {
      supersedeFact(sup.entityType, sup.entityName, sup.oldFactId, sup.newFact, "consolidation");
    }
  }

  await updateIndex();
}
