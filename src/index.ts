import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createAgent, getRequiredApiKey, refreshSystemPrompt } from "./agent.js";
import { consolidateSession } from "./memory/consolidator.js";
import { extractFromMessage, getLatestPair, shouldExtract, storeExtractions } from "./memory/realtime-extractor.js";
import { extractNameFromText, setUserName } from "./memory/profile.js";

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
  let assistantActive = false;

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
      if (process.env.COGITO_ENABLE_REALTIME !== "0") {
        const { userMessage, assistantMessage } = getLatestPair(agent.state.messages);
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

  const rl = readline.createInterface({ input, output });

  console.log("Cogito (MVP) - 'exit' で終了\n");

  while (true) {
    const line = await rl.question("You: ");
    const text = line.trim();
    if (!text) {
      continue;
    }
    const detectedName = extractNameFromText(text);
    if (detectedName) {
      setUserName(detectedName, "direct");
      refreshSystemPrompt(agent);
    }
    if (text === "exit" || text === "quit") {
      if (process.env.COGITO_ENABLE_CONSOLIDATE === "1") {
        console.log("記憶を整理中...");
        try {
          await consolidateSession(agent.state.messages);
          console.log("完了!");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Consolidation Error: ${message}`);
        }
      }
      break;
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
  }

  rl.close();
  console.log("Goodbye!");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
