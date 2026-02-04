import fs from "node:fs";
import path from "node:path";
import type { EntityType } from "./types.js";

const KNOWLEDGE_DIR = path.resolve(process.cwd(), "knowledge");
const DAILY_DIR = path.join(KNOWLEDGE_DIR, "memory");
const LONG_TERM_PATH = path.join(KNOWLEDGE_DIR, "MEMORY.md");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureLongTermFile(): void {
  if (!fs.existsSync(LONG_TERM_PATH)) {
    const content = "# MEMORY\n\n長期記憶（名前・役職・判断基準・継続的な事実）を保存します。\n";
    fs.writeFileSync(LONG_TERM_PATH, content, "utf8");
  }
}

function formatLine(entry: string, source: string): string {
  const ts = new Date().toISOString();
  return `- ${ts} [${source}] ${entry}`;
}

export function appendLongTerm(entry: string, source: string): void {
  ensureDir(KNOWLEDGE_DIR);
  ensureLongTermFile();
  fs.appendFileSync(LONG_TERM_PATH, `${formatLine(entry, source)}\n`, "utf8");
}

export function appendDaily(entry: string, source: string): void {
  ensureDir(DAILY_DIR);
  const date = new Date().toISOString().slice(0, 10);
  const dailyPath = path.join(DAILY_DIR, `${date}.md`);
  if (!fs.existsSync(dailyPath)) {
    fs.writeFileSync(dailyPath, `# ${date}\n\n`, "utf8");
  }
  fs.appendFileSync(dailyPath, `${formatLine(entry, source)}\n`, "utf8");
}

export function classifyMemory(type: EntityType): "long" | "daily" {
  if (type === "person" || type === "project" || type === "decision") {
    return "long";
  }
  return "daily";
}
