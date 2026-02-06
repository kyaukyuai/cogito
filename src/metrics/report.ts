import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "../memory/paths.js";

type TurnMetrics = {
  timestamp: string;
  mode: string;
  userText: string;
  assistantText: string;
  latencyMs: number;
  usedMemory: boolean;
  usedLearning: boolean;
  usedCriteria: boolean;
  usedSkillProposal: boolean;
};

type FeedbackEntry = {
  timestamp: string;
  rating: "good" | "bad";
};

const METRICS_DIR = path.join(KNOWLEDGE_DIR, "metrics");
const EVENTS_PATH = path.join(METRICS_DIR, "events.jsonl");
const FEEDBACK_DIR = path.join(KNOWLEDGE_DIR, "feedback");

function parseJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const items: T[] = [];
  for (const line of lines) {
    try {
      items.push(JSON.parse(line) as T);
    } catch {
      // skip malformed line
    }
  }
  return items;
}

function parseFeedbackEntries(dir: string): FeedbackEntry[] {
  if (!fs.existsSync(dir)) return [];
  const entries: FeedbackEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".md")) continue;
    const content = fs.readFileSync(path.join(dir, name), "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/- (\d{4}-\d{2}-\d{2}T[^ ]+) \[(good|bad)\]/);
      if (match) {
        entries.push({ timestamp: match[1], rating: match[2] as "good" | "bad" });
      }
    }
  }
  return entries;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function isoWeek(date: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

function formatRate(value: number, total: number): string {
  if (total === 0) return "unknown";
  return (value / total).toFixed(2);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "unknown";
  return value.toFixed(0);
}

function withinDays(ts: string, days: number, now: Date): boolean {
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return false;
  const diff = now.getTime() - parsed.getTime();
  return diff >= 0 && diff <= days * 86400000;
}

function ensureDir(): void {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function buildReport(): string {
  const now = new Date();
  const week = isoWeek(now);
  const periodDays = 7;
  const events = parseJsonl<TurnMetrics>(EVENTS_PATH).filter((e) =>
    withinDays(e.timestamp, periodDays, now)
  );
  const feedback = parseFeedbackEntries(FEEDBACK_DIR).filter((e) =>
    withinDays(e.timestamp, periodDays, now)
  );

  const total = events.length;
  const usedMemory = events.filter((e) => e.usedMemory).length;
  const usedLearning = events.filter((e) => e.usedLearning).length;
  const usedCriteria = events.filter((e) => e.usedCriteria).length;
  const usedSkill = events.filter((e) => e.usedSkillProposal).length;
  const latencies = events.map((e) => e.latencyMs).filter((v) => Number.isFinite(v));

  const good = feedback.filter((e) => e.rating === "good").length;
  const bad = feedback.filter((e) => e.rating === "bad").length;
  const feedbackScore = good + bad > 0 ? (good / (good + bad)).toFixed(2) : "unknown";

  const p95 = percentile(latencies, 95);
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return [
    `# Weekly Metrics (${week.year}-W${String(week.week).padStart(2, "0")})`,
    "",
    `Period: last ${periodDays} days`,
    "",
    `Turns: ${total}`,
    `Memory injection rate: ${formatRate(usedMemory, total)}`,
    `Learning injection rate: ${formatRate(usedLearning, total)}`,
    `Criteria usage rate: ${formatRate(usedCriteria, total)}`,
    `Skill proposal rate: ${formatRate(usedSkill, total)}`,
    `Latency avg (ms): ${formatNumber(avgLatency)}`,
    `Latency p95 (ms): ${formatNumber(p95)}`,
    `Feedback good/bad: ${good}/${bad}`,
    `Feedback score: ${feedbackScore}`,
    "",
  ].join("\n");
}

function writeReport(): void {
  ensureDir();
  const now = new Date();
  const { year, week } = isoWeek(now);
  const filename = `weekly-${year}-W${String(week).padStart(2, "0")}.md`;
  const reportPath = path.join(METRICS_DIR, filename);
  fs.writeFileSync(reportPath, buildReport(), "utf8");
  console.log(`Wrote ${reportPath}`);
}

writeReport();
