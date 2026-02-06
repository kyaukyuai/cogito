import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "../memory/paths.js";
import { loadEvalCases, loadTurnMetrics, scoreEval, type EvalSummary } from "./scorer.js";

type BaselineMetrics = {
  recallAccuracy: number | null;
  criteriaAlignment: number | null;
  skillSuccess: number | null;
  correctionRate: number | null;
  latencyP95: number | null;
};

type Baseline = {
  createdAt: string;
  periodDays: number;
  metrics: BaselineMetrics;
};

const METRICS_DIR = path.join(KNOWLEDGE_DIR, "metrics");
const EVENTS_PATH = path.join(METRICS_DIR, "events.jsonl");
const BASELINE_PATH = path.join(METRICS_DIR, "eval-baseline.json");
const CASES_PATH = path.resolve(process.cwd(), "src", "eval", "cases.jsonl");
const PERIOD_DAYS = Number(process.env.COGITO_EVAL_PERIOD_DAYS ?? "7");

function ensureDir(): void {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
}

function isoWeek(date: Date): { year: number; week: number } {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week };
}

function withinDays(ts: string, days: number, now: Date): boolean {
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) return false;
  const diff = now.getTime() - parsed.getTime();
  return diff >= 0 && diff <= days * 86400000;
}

function formatRatio(value: number | null): string {
  if (value === null) return "unknown";
  return value.toFixed(2);
}

function formatMs(value: number | null): string {
  if (value === null) return "unknown";
  return value.toFixed(0);
}

function metricDelta(current: number | null, base: number | null): string {
  if (current === null || base === null) return "unknown";
  const delta = current - base;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function metricDeltaMs(current: number | null, base: number | null): string {
  if (current === null || base === null) return "unknown";
  const delta = current - base;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}ms`;
}

function extractBaselineMetrics(summary: EvalSummary): BaselineMetrics {
  return {
    recallAccuracy: summary.recallAccuracy,
    criteriaAlignment: summary.criteriaAlignment,
    skillSuccess: summary.skillSuccess,
    correctionRate: summary.correctionRate,
    latencyP95: summary.latencyP95,
  };
}

function loadBaseline(): Baseline | null {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

function saveBaseline(summary: EvalSummary): Baseline {
  const baseline: Baseline = {
    createdAt: new Date().toISOString(),
    periodDays: PERIOD_DAYS,
    metrics: extractBaselineMetrics(summary),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), "utf8");
  return baseline;
}

function decideProgress(current: BaselineMetrics, baseline: BaselineMetrics): string {
  if (
    current.recallAccuracy === null ||
    current.criteriaAlignment === null ||
    current.skillSuccess === null ||
    current.correctionRate === null ||
    current.latencyP95 === null ||
    baseline.recallAccuracy === null ||
    baseline.criteriaAlignment === null ||
    baseline.skillSuccess === null ||
    baseline.correctionRate === null ||
    baseline.latencyP95 === null
  ) {
    return "unknown";
  }

  const improvedRecall = current.recallAccuracy - baseline.recallAccuracy >= 0.15;
  const improvedCriteria = current.criteriaAlignment - baseline.criteriaAlignment >= 0.2;
  const improvedSkill = current.skillSuccess - baseline.skillSuccess >= 0.1;
  const improvedCorrection = baseline.correctionRate - current.correctionRate >= 0.1;
  const latencyOkay = current.latencyP95 <= baseline.latencyP95 * 1.2;

  if (improvedRecall && improvedCriteria && improvedSkill && improvedCorrection && latencyOkay) {
    return "improved";
  }
  return "not yet";
}

function buildReport(summary: EvalSummary, baseline: Baseline | null, baselineSet: boolean): string {
  const now = new Date();
  const week = isoWeek(now);
  const metrics = extractBaselineMetrics(summary);
  const attempted = summary.caseScores.filter((item) => item.attempted).length;
  const passed = summary.caseScores.filter((item) => item.attempted && item.passed).length;
  const progress = baseline ? decideProgress(metrics, baseline.metrics) : "unknown";

  const lines = [
    `# Eval Report (${week.year}-W${String(week.week).padStart(2, "0")})`,
    "",
    `Period: last ${PERIOD_DAYS} days`,
    `Cases attempted/passed: ${attempted}/${passed}`,
    "",
    "## Metrics",
    `Recall accuracy: ${formatRatio(metrics.recallAccuracy)}${
      baseline ? ` (delta ${metricDelta(metrics.recallAccuracy, baseline.metrics.recallAccuracy)})` : ""
    }`,
    `Criteria alignment: ${formatRatio(metrics.criteriaAlignment)}${
      baseline ? ` (delta ${metricDelta(metrics.criteriaAlignment, baseline.metrics.criteriaAlignment)})` : ""
    }`,
    `Skill success: ${formatRatio(metrics.skillSuccess)}${
      baseline ? ` (delta ${metricDelta(metrics.skillSuccess, baseline.metrics.skillSuccess)})` : ""
    }`,
    `Correction rate (lower is better): ${formatRatio(metrics.correctionRate)}${
      baseline ? ` (delta ${metricDelta(metrics.correctionRate, baseline.metrics.correctionRate)})` : ""
    }`,
    `Latency p95: ${formatMs(metrics.latencyP95)}${
      baseline ? ` (delta ${metricDeltaMs(metrics.latencyP95, baseline.metrics.latencyP95)})` : ""
    }`,
    "",
    "## Progress",
    `Status: ${progress}`,
    baseline
      ? `Baseline date: ${baseline.createdAt}`
      : "Baseline date: unknown (run with --set-baseline once data exists)",
    baselineSet ? "Baseline was updated in this run." : "Baseline unchanged.",
    "",
    "## Case Details",
    ...summary.caseScores.map((score) =>
      `- ${score.id} | attempted=${score.attempted} | passed=${score.passed} | reason=${score.reason}`
    ),
    "",
  ];
  return lines.join("\n");
}

function writeReport(markdown: string): string[] {
  const now = new Date();
  const { year, week } = isoWeek(now);
  const weeklyPath = path.join(METRICS_DIR, `eval-${year}-W${String(week).padStart(2, "0")}.md`);
  const latestPath = path.join(METRICS_DIR, "eval-latest.md");
  fs.writeFileSync(weeklyPath, markdown, "utf8");
  fs.writeFileSync(latestPath, markdown, "utf8");
  return [weeklyPath, latestPath];
}

function main() {
  ensureDir();

  const setBaseline = process.argv.includes("--set-baseline");
  const now = new Date();
  const cases = loadEvalCases(CASES_PATH);
  const events = loadTurnMetrics(EVENTS_PATH).filter((item) => withinDays(item.timestamp, PERIOD_DAYS, now));
  const summary = scoreEval(cases, events);

  let baseline = loadBaseline();
  let baselineSet = false;
  if (setBaseline || !baseline) {
    baseline = saveBaseline(summary);
    baselineSet = true;
  }

  const report = buildReport(summary, baseline, baselineSet);
  const [weeklyPath, latestPath] = writeReport(report);
  console.log(`Wrote ${weeklyPath}`);
  console.log(`Wrote ${latestPath}`);
}

main();
