import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { reviewSkillSource, type ReviewResult } from "./review.js";

export type LoadedTool = {
  tool: AgentTool;
  path: string;
};

export type ReviewReport = ReviewResult & { path: string };

const GENERATED_DIR = path.resolve(process.cwd(), "src", "skills", "generated");

function isAgentTool(value: unknown): value is AgentTool {
  if (!value || typeof value !== "object") return false;
  const tool = value as {
    name?: unknown;
    description?: unknown;
    label?: unknown;
    parameters?: unknown;
    execute?: unknown;
  };
  return (
    typeof tool.name === "string" &&
    typeof tool.description === "string" &&
    typeof tool.label === "string" &&
    typeof tool.parameters === "object" &&
    tool.parameters !== null &&
    typeof tool.execute === "function"
  );
}

export async function reviewAndLoadToolFromFile(filePath: string): Promise<{
  tool?: AgentTool;
  review: ReviewReport;
  error?: string;
}> {
  let source = "";
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      review: { ok: false, issues: [`read error: ${message}`], path: filePath },
      error: message,
    };
  }

  const review = { ...reviewSkillSource(source), path: filePath };
  if (!review.ok) {
    return { review };
  }

  try {
    const url = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
    const mod = await import(url);
    const candidate = mod.tool ?? mod.default;
    if (!isAgentTool(candidate)) {
      return {
        review,
        error: "exported tool is missing required fields (name/description/label/parameters/execute)",
      };
    }
    return { review, tool: candidate };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { review, error: message };
  }
}

export async function loadGeneratedTools(): Promise<{
  tools: LoadedTool[];
  reviews: ReviewReport[];
  errors: Array<{ path: string; error: string }>;
}> {
  const tools: LoadedTool[] = [];
  const reviews: ReviewReport[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  let entries: string[] = [];
  try {
    entries = await fs.readdir(GENERATED_DIR);
  } catch {
    return { tools, reviews, errors };
  }

  for (const entry of entries) {
    if (!entry.endsWith(".ts")) continue;
    const filePath = path.join(GENERATED_DIR, entry);
    const result = await reviewAndLoadToolFromFile(filePath);
    reviews.push(result.review);
    if (result.error) {
      errors.push({ path: filePath, error: result.error });
    }
    if (result.tool) {
      tools.push({ tool: result.tool, path: filePath });
    }
  }

  return { tools, reviews, errors };
}
