import type { Agent, AgentTool } from "@mariozechner/pi-agent-core";
import { setAgentTools } from "../agent.js";
import { generateSkill } from "./skill-generator.js";
import { loadGeneratedTools, reviewAndLoadToolFromFile } from "./loader.js";
import { reviewSkillSource } from "./review.js";

export type SkillRuntime = {
  extraTools: AgentTool[];
};

export type SkillRequestResult = {
  handled: boolean;
  message?: string;
};

export async function bootstrapGeneratedSkills(
  agent: Agent,
  runtime: SkillRuntime
): Promise<{ names: string[]; errors: Array<{ path: string; error: string }> }> {
  const loaded = await loadGeneratedTools();
  for (const entry of loaded.tools) {
    const existing = runtime.extraTools.findIndex((tool) => tool.name === entry.tool.name);
    if (existing >= 0) {
      runtime.extraTools[existing] = entry.tool;
    } else {
      runtime.extraTools.push(entry.tool);
    }
  }

  if (loaded.tools.length > 0) {
    setAgentTools(agent, runtime.extraTools);
  }

  return { names: loaded.tools.map((item) => item.tool.name), errors: loaded.errors };
}

export function describeSkillLoadErrors(errors: Array<{ path: string; error: string }>): string[] {
  return errors.map((error) => `Skill load error (${error.path}): ${error.error}`);
}

export async function handleSkillRequest(
  agent: Agent,
  runtime: SkillRuntime,
  request: string
): Promise<SkillRequestResult> {
  const proposal = await generateSkill(request);
  if (!proposal) {
    return { handled: true, message: "スキル提案を生成できませんでした。" };
  }

  const review = reviewSkillSource(proposal.code);
  if (!review.ok) {
    return {
      handled: true,
      message: `【スキル案】\n${proposal.name}\n${proposal.description}\nレビュー: NG\n- ${review.issues.join("\n- ")}`,
    };
  }

  let loadNote = "ロード: 失敗";
  if (proposal.applied && proposal.path) {
    const loaded = await reviewAndLoadToolFromFile(proposal.path);
    if (loaded.tool) {
      const existing = runtime.extraTools.findIndex((tool) => tool.name === loaded.tool?.name);
      if (existing >= 0) {
        runtime.extraTools[existing] = loaded.tool;
      } else {
        runtime.extraTools.push(loaded.tool);
      }
      setAgentTools(agent, runtime.extraTools);
      loadNote = `ロード: ${loaded.tool.name}`;
    } else if (loaded.error) {
      loadNote = `ロード: 失敗 (${loaded.error})`;
    } else {
      loadNote = "ロード: 失敗 (review)";
    }
  } else {
    loadNote = "ロード: 未実行（COGITO_ALLOW_SKILL_WRITE=1 で書き込み）";
  }

  const note = proposal.applied
    ? `生成済み: ${proposal.path}`
    : "提案のみ（COGITO_ALLOW_SKILL_WRITE=1 で書き込み）";

  return {
    handled: true,
    message: `【スキル案】\n${proposal.name}\n${proposal.description}\n${note}\nレビュー: OK\n${loadNote}`,
  };
}
