import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createAgent, getRequiredApiKey } from "./agent.js";

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
    if (text === "exit" || text === "quit") {
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
