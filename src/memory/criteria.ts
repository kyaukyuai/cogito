import { addFact, createEntity, entityExists } from "./para.js";
import { appendLongTerm } from "./journal.js";
import { updateIndex } from "./search.js";

const CRITERIA_ENTITY = "decision-criteria";
const CRITERIA_SUMMARY = "User decision criteria and evaluation preferences.";

const CRITERIA_PATTERNS: RegExp[] = [
  /重視する|大事にする|重要視する|最優先|優先する/u,
  /判断基準|基準|方針|ポリシー/u,
  /避ける|避けたい|控える|望まない|好まない/u,
  /譲れない|必須条件|条件/u,
  /よりも|より|ではなく/u,
];

const SPLIT_PATTERN = /[。！？\n]/;

function normalizeCriterion(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function extractCriteriaFromText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentences = trimmed.split(SPLIT_PATTERN).map((s) => s.trim()).filter(Boolean);
  const hits = sentences.filter((sentence) => CRITERIA_PATTERNS.some((pattern) => pattern.test(sentence)));
  const normalized = hits.map(normalizeCriterion).filter(Boolean);
  return Array.from(new Set(normalized));
}

export async function storeCriteria(criteria: string[], source: string): Promise<boolean> {
  const items = criteria.map(normalizeCriterion).filter(Boolean);
  if (items.length === 0) return false;
  if (!entityExists("resource", CRITERIA_ENTITY)) {
    createEntity("resource", CRITERIA_ENTITY, CRITERIA_SUMMARY);
  }
  for (const item of items) {
    const line = item.startsWith("判断基準") ? item : `判断基準: ${item}`;
    addFact("resource", CRITERIA_ENTITY, line, source);
    appendLongTerm(line, source);
  }
  await updateIndex();
  return true;
}
