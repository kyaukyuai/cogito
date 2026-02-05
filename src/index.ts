import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { createAgent, getRequiredApiKey, refreshSystemPrompt } from "./agent.js";
import { consolidateSession } from "./memory/consolidator.js";
import { extractFromMessage, getLatestPair, shouldExtract, storeExtractions } from "./memory/realtime-extractor.js";
import { extractCriteriaFromText, storeCriteria } from "./memory/criteria.js";
import { parseFeedbackInput, recordFeedback } from "./memory/feedback.js";
import { extractNameFromText, setUserName } from "./memory/profile.js";
import { isSkillRequest } from "./skills/skill-generator.js";
import { bootstrapGeneratedSkills, describeSkillLoadErrors, handleSkillRequest, type SkillRuntime } from "./skills/runtime.js";
import { ENABLE_CONSOLIDATE, ENABLE_REALTIME, ENABLE_SKILL_GEN } from "./config.js";
import { runCli } from "./cli/loop.js";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

function parseModelSpec(spec: string): { provider: string; model: string } {
  if (spec.includes("/")) {
    const [provider, ...rest] = spec.split("/");
    return { provider, model: rest.join("/") };
  }
  return { provider: "anthropic", model: spec };
}

async function main() {
  const modelSpec = process.env.COGITO_MODEL ?? DEFAULT_MODEL;
  const { provider } = parseModelSpec(modelSpec);
  const requiredKey = getRequiredApiKey(provider);

  if (requiredKey && !process.env[requiredKey]) {
    console.error(
      `Error: ${requiredKey} is not set. Please set it in your environment (see .env.example).`
    );
    process.exit(1);
  }

  const agent = createAgent();
  const skillRuntime: SkillRuntime = { extraTools: [] };

  if (ENABLE_SKILL_GEN) {
    const loaded = await bootstrapGeneratedSkills(agent, skillRuntime);
    if (loaded.names.length > 0) {
      console.log(`Loaded skills: ${loaded.names.join(", ")}`);
    }
    const errors = describeSkillLoadErrors(loaded.errors);
    for (const line of errors) {
      console.error(line);
    }
  }
  let assistantActive = false;
  let pendingFeedback: { userMessage: string; assistantMessage: string } | null = null;
  let feedbackHintShown = false;

  agent.subscribe((event) => {
    if (event.type === "message_start" && event.message.role === "assistant") {
      assistantActive = true;
      output.write("Assistant: ");
    }

    if (event.type === "message_update" && event.message.role === "assistant") {
      if (event.assistantMessageEvent.type === "text_delta") {
        output.write(event.assistantMessageEvent.delta);
      }
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      assistantActive = false;
      output.write("\n");
      const latestPair = getLatestPair(agent.state.messages);
      if (latestPair.userMessage || latestPair.assistantMessage) {
        pendingFeedback = latestPair;
        if (!feedbackHintShown) {
          output.write("評価: + / -（任意でメモ）\n");
          feedbackHintShown = true;
        }
      }
      if (ENABLE_REALTIME) {
        const { userMessage, assistantMessage } = latestPair;
        const criteria = extractCriteriaFromText(userMessage);
        if (criteria.length > 0) {
          queueMicrotask(async () => {
            try {
              await storeCriteria(criteria, "realtime");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error(`Criteria Error: ${message}`);
            }
          });
          output.write(`学習: ${criteria[0]}\n`);
        }
        if (shouldExtract(userMessage, assistantMessage)) {
          queueMicrotask(async () => {
            try {
              const results = await extractFromMessage(
                userMessage,
                assistantMessage,
                agent.state.messages
              );
              await storeExtractions(results);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error(`Extraction Error: ${message}`);
            }
          });
        }
      }
    }
  });

  const banner = "Cogito (MVP) - 'exit' で終了";
  const pasteDebounceMs = Number(process.env.COGITO_PASTE_DEBOUNCE_MS ?? "60");

  await runCli(
    {
      onInput: async (text) => {
        if (pendingFeedback) {
          const feedback = parseFeedbackInput(text);
          if (feedback) {
            try {
              recordFeedback({
                rating: feedback.rating,
                note: feedback.note,
                userMessage: pendingFeedback.userMessage,
                assistantMessage: pendingFeedback.assistantMessage,
              });
              output.write("評価を記録しました。\n");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              output.write(`評価の記録に失敗しました: ${message}\n`);
            }
            pendingFeedback = null;
            return false;
          }
          pendingFeedback = null;
        }

        const detectedName = extractNameFromText(text);
        if (detectedName) {
          setUserName(detectedName, "direct");
          refreshSystemPrompt(agent);
        }

        if (ENABLE_SKILL_GEN && isSkillRequest(text)) {
          try {
            const result = await handleSkillRequest(agent, skillRuntime, text);
            if (result.message) {
              output.write("Assistant: ");
              output.write(`${result.message}\n`);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            output.write(`スキル提案エラー: ${message}\n`);
          }
          return false;
        }

        if (text === "exit" || text === "quit") {
          if (ENABLE_CONSOLIDATE) {
            console.log("記憶を整理中...");
            try {
              await consolidateSession(agent.state.messages);
              console.log("完了!");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error(`Consolidation Error: ${message}`);
            }
          }
          console.log("Goodbye!");
          return true;
        }

        try {
          await agent.prompt(text);
          if (assistantActive) {
            output.write("\n");
            assistantActive = false;
          }
        } catch (error) {
          if (assistantActive) {
            output.write("\n");
            assistantActive = false;
          }
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Error: ${message}`);
        }
        return false;
      },
    },
    {
      input,
      output,
      banner,
      prompt: "You: ",
      pasteDebounceMs,
    }
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
