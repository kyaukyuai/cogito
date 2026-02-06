import fs from "node:fs";

export type EvalKind = "recall" | "criteria" | "skill";

export type EvalCase = {
  id: string;
  kind: EvalKind;
  queries: string[];
  requiredAny?: string[];
  requiredAll?: string[];
  forbiddenAny?: string[];
};

export type TurnMetrics = {
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

export type CaseScore = {
  id: string;
  kind: EvalKind;
  attempted: boolean;
  passed: boolean;
  reason: string;
  matchedQuery: string | null;
  timestamp: string | null;
};

export type EvalSummary = {
  caseScores: CaseScore[];
  recallAccuracy: number | null;
  criteriaAlignment: number | null;
  skillSuccess: number | null;
  correctionRate: number | null;
  latencyP95: number | null;
};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const rows: T[] = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      // skip malformed line
    }
  }
  return rows;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function safeRate(passed: number, attempted: number): number | null {
  if (attempted === 0) return null;
  return passed / attempted;
}

function findLatestEventByQueries(events: TurnMetrics[], queries: string[]): TurnMetrics | null {
  const targets = queries.map(normalize);
  const matched = events.filter((event) => {
    const user = normalize(event.userText);
    return targets.some((target) => user === target || user.includes(target) || target.includes(user));
  });
  if (matched.length === 0) return null;
  return matched.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).at(-1) ?? null;
}

function evaluateCase(def: EvalCase, events: TurnMetrics[]): CaseScore {
  const latest = findLatestEventByQueries(events, def.queries);
  if (!latest) {
    return {
      id: def.id,
      kind: def.kind,
      attempted: false,
      passed: false,
      reason: "no matched turn",
      matchedQuery: null,
      timestamp: null,
    };
  }

  const answer = normalize(latest.assistantText);
  const requiredAny = (def.requiredAny ?? []).map(normalize);
  const requiredAll = (def.requiredAll ?? []).map(normalize);
  const forbiddenAny = (def.forbiddenAny ?? []).map(normalize);

  const hitRequiredAny =
    requiredAny.length === 0 ? true : requiredAny.some((token) => token.length > 0 && answer.includes(token));
  const hitRequiredAll =
    requiredAll.length === 0 ? true : requiredAll.every((token) => token.length > 0 && answer.includes(token));
  const hitForbidden = forbiddenAny.some((token) => token.length > 0 && answer.includes(token));

  if (def.kind === "skill" && !latest.usedSkillProposal) {
    return {
      id: def.id,
      kind: def.kind,
      attempted: true,
      passed: false,
      reason: "skill proposal flag missing",
      matchedQuery: latest.userText,
      timestamp: latest.timestamp,
    };
  }

  const passed = hitRequiredAny && hitRequiredAll && !hitForbidden;
  const reason = passed ? "ok" : `requiredAny=${hitRequiredAny} requiredAll=${hitRequiredAll} forbidden=${hitForbidden}`;
  return {
    id: def.id,
    kind: def.kind,
    attempted: true,
    passed,
    reason,
    matchedQuery: latest.userText,
    timestamp: latest.timestamp,
  };
}

function computeCorrectionRate(events: TurnMetrics[]): number | null {
  if (events.length === 0) return null;
  const groups = new Map<string, number>();
  for (const event of events) {
    const key = normalize(event.userText);
    if (!key || key === "+" || key === "-" || key === "good" || key === "bad") continue;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  if (groups.size === 0) return null;
  const retried = [...groups.values()].filter((count) => count >= 2).length;
  return retried / groups.size;
}

export function loadEvalCases(filePath: string): EvalCase[] {
  const rows = parseJsonl<EvalCase>(filePath);
  return rows.filter((row) => row && row.id && row.kind && Array.isArray(row.queries));
}

export function loadTurnMetrics(filePath: string): TurnMetrics[] {
  return parseJsonl<TurnMetrics>(filePath).filter(
    (row) =>
      row &&
      typeof row.timestamp === "string" &&
      typeof row.userText === "string" &&
      typeof row.assistantText === "string" &&
      typeof row.latencyMs === "number"
  );
}

export function scoreEval(cases: EvalCase[], events: TurnMetrics[]): EvalSummary {
  const caseScores = cases.map((item) => evaluateCase(item, events));

  const scoreByKind = (kind: EvalKind): number | null => {
    const subset = caseScores.filter((score) => score.kind === kind && score.attempted);
    return safeRate(subset.filter((s) => s.passed).length, subset.length);
  };

  const latencies = events.map((e) => e.latencyMs).filter((v) => Number.isFinite(v));
  return {
    caseScores,
    recallAccuracy: scoreByKind("recall"),
    criteriaAlignment: scoreByKind("criteria"),
    skillSuccess: scoreByKind("skill"),
    correctionRate: computeCorrectionRate(events),
    latencyP95: percentile(latencies, 95),
  };
}
