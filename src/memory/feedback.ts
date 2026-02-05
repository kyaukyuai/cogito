import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "./paths.js";

export type FeedbackRating = "good" | "bad";

export type FeedbackEntry = {
  rating: FeedbackRating;
  userMessage: string;
  assistantMessage: string;
  note?: string;
  timestamp?: string;
};

const FEEDBACK_DIR = path.join(KNOWLEDGE_DIR, "feedback");

function ensureDir(): void {
  if (!fs.existsSync(FEEDBACK_DIR)) {
    fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  }
}

function compact(text: string, max = 160): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function getDailyPath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(FEEDBACK_DIR, `${date}.md`);
}

export function parseFeedbackInput(text: string): { rating: FeedbackRating; note?: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (lower === "+" || lower === "g" || lower === "good") {
    return { rating: "good" };
  }
  if (lower === "-" || lower === "b" || lower === "bad") {
    return { rating: "bad" };
  }

  const match = trimmed.match(/^([+-]|good|bad|g|b)(?::|\s+)(.+)$/i);
  if (match) {
    const tag = match[1].toLowerCase();
    const note = match[2]?.trim();
    if (tag === "+" || tag === "g" || tag === "good") {
      return { rating: "good", note };
    }
    if (tag === "-" || tag === "b" || tag === "bad") {
      return { rating: "bad", note };
    }
  }

  return null;
}

export function recordFeedback(entry: FeedbackEntry): void {
  ensureDir();
  const ts = entry.timestamp ?? new Date().toISOString();
  const dailyPath = getDailyPath();
  if (!fs.existsSync(dailyPath)) {
    fs.writeFileSync(dailyPath, `# ${ts.slice(0, 10)}\n\n`, "utf8");
  }

  const user = compact(entry.userMessage);
  const assistant = compact(entry.assistantMessage);
  const note = entry.note ? ` | note: ${compact(entry.note, 120)}` : "";
  const line = `- ${ts} [${entry.rating}] user: ${user} | assistant: ${assistant}${note}`;
  fs.appendFileSync(dailyPath, `${line}\n`, "utf8");
}
