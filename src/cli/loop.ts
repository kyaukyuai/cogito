import readline from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";
import { createBufferedInput } from "./input-buffer.js";

export type CliHandlers = {
  onInput: (text: string) => Promise<boolean | void>;
};

export type CliOptions = {
  input: ReadStream;
  output: WriteStream;
  banner?: string;
  prompt?: string;
  pasteDebounceMs?: number;
};

export async function runCli(handlers: CliHandlers, options: CliOptions): Promise<void> {
  const { input, output, banner, prompt = "You: ", pasteDebounceMs = 60 } = options;
  const rl = readline.createInterface({ input, output });
  let processing = false;
  const queue: string[] = [];
  let closed = false;

  if (banner) {
    output.write(`${banner}\n\n`);
  }

  rl.setPrompt(prompt);
  rl.prompt();

  const processQueue = async () => {
    if (processing || closed) return;
    processing = true;
    while (queue.length > 0 && !closed) {
      const text = queue.shift()!;
      const shouldExit = await handlers.onInput(text);
      if (shouldExit) {
        closed = true;
        rl.close();
        break;
      }
    }
    processing = false;
    if (!closed) {
      rl.prompt();
      if (queue.length > 0) {
        void processQueue();
      }
    }
  };

  const buffered = createBufferedInput(pasteDebounceMs, (text) => {
    queue.push(text);
    void processQueue();
  }, output);

  rl.on("line", buffered.onLine);

  rl.on("close", () => {
    closed = true;
  });
}
