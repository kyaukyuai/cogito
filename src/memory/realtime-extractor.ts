import { completeSimple, getModel } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { addFact, createEntity, entityExists } from "./para.js";
import { appendDaily, appendLongTerm, classifyMemory } from "./journal.js";
import { extractNameFromText, setUserName } from "./profile.js";
import { updateIndex } from "./search.js";
import type { EntityType } from "./types.js";

export interface ExtractionResult {
  type: EntityType;
  entity: string;
  facts: string[];
}

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

const EXTRACTION_HINTS = [
  /(?:さん|氏|社長|部長|課長|CEO|CTO)/,
  /(?:プロジェクト|案件|PJ|施策)/,
  /(?:決定|決めた|方針|ルール)/,
  /(?:覚えて|重要|忘れないで)/,
  /(?:私|わたし|僕|俺)は.+?です/,
];

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

function coerceJson(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return "[]";
}

export function shouldExtract(userMessage: string, assistantResponse: string): boolean {
  const combined = `${userMessage}\n${assistantResponse}`;
  return EXTRACTION_HINTS.some((pattern) => pattern.test(combined));
}

export async function extractFromMessage(
  userMessage: string,
  assistantResponse: string,
  history: AgentMessage[]
): Promise<ExtractionResult[]> {
  const detectedName = extractNameFromText(userMessage);
  if (detectedName) {
    setUserName(detectedName, "realtime");
    return [
      {
        type: "person",
        entity: detectedName,
        facts: [`ユーザー名は${detectedName}です。`],
      },
    ];
  }
  const prompt = `以下の会話から、記憶すべき重要情報を抽出してください。\n\n## 抽出対象\n- 人物情報（名前、役職、特徴、関係性）\n- プロジェクト情報（名前、目的、期限、関係者）\n- 意思決定（何を、なぜ、いつ決めたか）\n- 重要な事実（数値、日付、固有名詞を含む情報）\n\n## 会話\nUser: ${userMessage}\nAssistant: ${assistantResponse}\n\n## 出力形式（JSON）\n[{ "type": "person|project|decision|fact|resource", "entity": "エンティティ名", "facts": ["事実1", "事実2"] }]\n\n抽出すべき情報がない場合は空配列 [] を返してください。`;

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
  const parsed = JSON.parse(json) as ExtractionResult[];

  return Array.isArray(parsed) ? parsed : [];
}

export async function storeExtractions(results: ExtractionResult[]): Promise<void> {
  for (const result of results) {
    const type = result.type;
    const entityName = result.entity?.trim() || "general";
    if (!entityExists(type, entityName)) {
      createEntity(type, entityName, result.facts[0] ?? "");
    }
    for (const fact of result.facts) {
      addFact(type, entityName, fact, "realtime");
      if (classifyMemory(type) === "long") {
        appendLongTerm(fact, "realtime");
      } else {
        appendDaily(fact, "realtime");
      }
      const nameFromFact = extractNameFromText(fact.replace("ユーザー名は", "名前は"));
      if (nameFromFact) {
        setUserName(nameFromFact, "realtime");
      }
    }
  }
  if (results.length > 0) {
    await updateIndex();
  }
}

export function getLatestPair(messages: AgentMessage[]): {
  userMessage: string;
  assistantMessage: string;
} {
  const assistant = [...messages].reverse().find((m) => m.role === "assistant");
  const assistantText = extractText(assistant);
  const assistantIndex = messages.lastIndexOf(assistant as AgentMessage);
  const user = messages.slice(0, assistantIndex).reverse().find((m) => m.role === "user");
  const userText = extractText(user);
  return { userMessage: userText, assistantMessage: assistantText };
}
