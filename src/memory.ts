import fs from "node:fs";
import path from "node:path";

export interface Memory {
  content: string;
  timestamp: number;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "memories.json");
const DEFAULT_LIMIT = 20;

function readMemories(): Memory[] {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is Memory => {
      return (
        typeof item === "object" &&
        item !== null &&
        typeof (item as Memory).content === "string" &&
        typeof (item as Memory).timestamp === "number"
      );
    });
  } catch {
    return [];
  }
}

export function loadMemories(limit: number = DEFAULT_LIMIT): Memory[] {
  const all = readMemories();
  if (all.length <= limit) {
    return all;
  }
  return all.slice(all.length - limit);
}

export function saveMemory(content: string): void {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }
  const memories = readMemories();
  memories.push({ content: trimmed, timestamp: Date.now() });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(memories, null, 2), "utf8");
}

export function formatMemoriesForContext(memories: Memory[]): string {
  if (memories.length === 0) {
    return "## 記憶\n（保存された記憶はありません）";
  }
  const lines = memories.map((memory) => {
    const ts = new Date(memory.timestamp).toISOString();
    return `- ${ts}: ${memory.content}`;
  });
  return `## 記憶\n${lines.join("\n")}`;
}
