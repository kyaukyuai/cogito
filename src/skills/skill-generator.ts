import fs from "node:fs";
import path from "node:path";
import { completeSimple, getModel } from "@mariozechner/pi-ai";
import { ALLOW_SKILL_WRITE, ENABLE_SKILL_GEN } from "../config.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
export const SKILL_REQUEST_PATTERN =
  /機能が欲しい|ツールを(追加|作成|実装)|add a tool|build a tool|implement .* tool/i;

export interface SkillProposal {
  name: string;
  description: string;
  code: string;
  path: string | null;
  applied: boolean;
}

export function isSkillRequest(text: string): boolean {
  return SKILL_REQUEST_PATTERN.test(text);
}

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

function coerceJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return "{}";
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function generateSkill(request: string): Promise<SkillProposal | null> {
  if (!ENABLE_SKILL_GEN) return null;

  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider, model } = parseModelSpec(modelSpec);
  const llm = getModel(provider, model);

  const prompt = `You are generating an AgentTool in TypeScript.\nReturn ONLY JSON with fields: name, description, code.\nThe code MUST export a const named tool implementing AgentTool with required fields:\n- name (string)\n- label (string)\n- description (string)\n- parameters (TypeBox schema)\n- execute(toolCallId, params, signal?, onUpdate?) returning { content: [{type:\"text\", text: string}], details: any }\n\nUse this skeleton:\n\nimport type { AgentTool } from \"@mariozechner/pi-agent-core\";\nimport { Type } from \"@sinclair/typebox\";\n\nexport const tool: AgentTool = {\n  name: \"...\",\n  label: \"...\",\n  description: \"...\",\n  parameters: Type.Object({\n    // ...\n  }),\n  execute: async (_toolCallId, params) => {\n    // ...\n    return { content: [{ type: \"text\", text: JSON.stringify(result) }], details: result };\n  }\n};\n\nRequest: ${request}`;

  const response = await completeSimple(llm, {
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

  const parsed = JSON.parse(coerceJson(text)) as { name?: string; description?: string; code?: string };
  if (!parsed.name || !parsed.description || !parsed.code) {
    return null;
  }

  const fileName = `${slugify(parsed.name)}.ts`;
  const targetDir = path.resolve(process.cwd(), "src", "skills", "generated");
  const targetPath = path.join(targetDir, fileName);

  if (ALLOW_SKILL_WRITE) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, parsed.code, "utf8");
    return {
      name: parsed.name,
      description: parsed.description,
      code: parsed.code,
      path: targetPath,
      applied: true,
    };
  }

  return {
    name: parsed.name,
    description: parsed.description,
    code: parsed.code,
    path: null,
    applied: false,
  };
}
