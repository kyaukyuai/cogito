import { completeSimple, getModel } from "@mariozechner/pi-ai";
import { addFact, createEntity, entityExists } from "../memory/para.js";
import { updateIndex } from "../memory/search.js";
import type { EntityType } from "../memory/types.js";
import { webSearch, type WebSearchResult } from "./web-search.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

export interface LearnedKnowledge {
  topic: string;
  summary: string;
  facts: string[];
  entityType: EntityType;
  sources: string[];
}

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

function coerceJson(text: string, type: "array" | "object"): string {
  const start = text.indexOf(type === "array" ? "[" : "{");
  const end = text.lastIndexOf(type === "array" ? "]" : "}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return type === "array" ? "[]" : "{}";
}

async function generateSearchQueries(query: string): Promise<string[]> {
  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);
  const llm = getModel(provider, model);

  const prompt = `Generate 3 diverse web search queries for: "${query}".\nReturn ONLY a JSON array of strings.`;
  const response = await completeSimple(llm, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  try {
    const parsed = JSON.parse(coerceJson(text, "array")) as string[];
    return parsed.length > 0 ? parsed.slice(0, 3) : [query];
  } catch {
    return [query];
  }
}

async function synthesizeKnowledge(
  query: string,
  results: WebSearchResult[]
): Promise<LearnedKnowledge> {
  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);
  const llm = getModel(provider, model);

  const prompt = `Analyze these search results and return structured knowledge as JSON.\n\nQuestion: ${query}\n\nResults:\n${results
    .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\nURL: ${r.url}`)
    .join("\n\n")}\n\nJSON format:\n{\n  "topic": "short entity name",\n  "summary": "2-3 sentences",\n  "facts": ["fact1", "fact2", "fact3"],\n  "entityType": "person" | "project" | "resource",\n  "sources": ["url1", "url2"]\n}`;

  const response = await completeSimple(llm, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  try {
    const parsed = JSON.parse(coerceJson(text, "object")) as LearnedKnowledge;
    if (parsed.topic && parsed.summary && Array.isArray(parsed.facts)) {
      return {
        topic: parsed.topic,
        summary: parsed.summary,
        facts: parsed.facts,
        entityType: parsed.entityType ?? "resource",
        sources: parsed.sources ?? results.map((r) => r.url),
      };
    }
  } catch {
    // fallthrough to fallback
  }

  return {
    topic: query.slice(0, 50),
    summary: results[0]?.snippet ?? query,
    facts: results.slice(0, 3).map((r) => r.snippet || r.title),
    entityType: "resource",
    sources: results.map((r) => r.url),
  };
}

export async function learnAutonomously(query: string): Promise<LearnedKnowledge> {
  const queries = await generateSearchQueries(query);

  const searchResults = (
    await Promise.all(queries.map((q) => webSearch(q).catch(() => [])))
  ).flat();

  if (searchResults.length === 0) {
    throw new Error("No search results");
  }

  const knowledge = await synthesizeKnowledge(query, searchResults);

  if (!entityExists(knowledge.entityType, knowledge.topic)) {
    createEntity(knowledge.entityType, knowledge.topic, knowledge.summary);
  }

  for (const fact of knowledge.facts) {
    addFact(
      knowledge.entityType,
      knowledge.topic,
      fact,
      `autonomous-learning: ${knowledge.sources[0] ?? "web"}`
    );
  }

  await updateIndex();
  return knowledge;
}
