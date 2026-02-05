import type { WriteStream } from "node:tty";

export type BufferedInput = {
  onLine: (line: string) => void;
  flush: () => void;
};

export function createBufferedInput(
  debounceMs: number,
  onText: (text: string) => void,
  output?: WriteStream
): BufferedInput {
  const lineBuffer: string[] = [];
  let bufferTimer: NodeJS.Timeout | null = null;

  const flush = () => {
    const text = lineBuffer.join("\n").trim();
    lineBuffer.length = 0;
    if (!text) {
      return;
    }
    onText(text);
  };

  const scheduleFlush = () => {
    if (bufferTimer) clearTimeout(bufferTimer);
    bufferTimer = setTimeout(() => {
      bufferTimer = null;
      flush();
    }, debounceMs);
  };

  const onLine = (line: string) => {
    lineBuffer.push(line);
    scheduleFlush();
  };

  if (output) {
    output.on("resize", () => {
      if (lineBuffer.length > 0) {
        flush();
      }
    });
  }

  return { onLine, flush };
}
