export type ReviewResult = {
  ok: boolean;
  issues: string[];
};

const DISALLOWED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bchild_process\b/, reason: "child_process is not allowed" },
  { pattern: /\bfs\b/, reason: "filesystem access is not allowed" },
  { pattern: /\bnet\b/, reason: "network sockets are not allowed" },
  { pattern: /\bhttp\b|\bhttps\b/, reason: "direct HTTP access is not allowed" },
  { pattern: /\bprocess\b/, reason: "process access is not allowed" },
  { pattern: /\beval\b|\bFunction\b/, reason: "dynamic code execution is not allowed" },
  { pattern: /\bimport\s*\(/, reason: "dynamic import is not allowed" },
  { pattern: /\bBun\b/, reason: "Bun runtime access is not allowed" },
];

export function reviewSkillSource(source: string): ReviewResult {
  const issues: string[] = [];
  for (const rule of DISALLOWED_PATTERNS) {
    if (rule.pattern.test(source)) {
      issues.push(rule.reason);
    }
  }
  return { ok: issues.length === 0, issues };
}
