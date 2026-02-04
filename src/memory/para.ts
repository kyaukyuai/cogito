import fs from "node:fs";
import path from "node:path";
import type { Entity, EntityType, Fact } from "./types.js";

const KNOWLEDGE_DIR = path.resolve(process.cwd(), "knowledge");

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9faf]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function getCategory(type: EntityType): string {
  if (type === "person") return "areas/people";
  if (type === "project") return "projects";
  return "resources";
}

export function getEntityDir(type: EntityType, name: string): string {
  return path.join(KNOWLEDGE_DIR, getCategory(type), slugify(name));
}

export function entityExists(type: EntityType, name: string): boolean {
  const dir = getEntityDir(type, name);
  return fs.existsSync(dir);
}

export function createEntity(type: EntityType, name: string, summary: string): void {
  const dir = getEntityDir(type, name);
  fs.mkdirSync(dir, { recursive: true });

  const summaryContent = `# ${name}\n\n## 概要\n${summary}\n\n## 記憶\n\n## 関連\n`;
  fs.writeFileSync(path.join(dir, "summary.md"), summaryContent, "utf8");
  fs.writeFileSync(path.join(dir, "items.json"), "[]", "utf8");
}

export function addFact(
  type: EntityType,
  name: string,
  fact: string,
  source: string
): Fact {
  const dir = getEntityDir(type, name);
  fs.mkdirSync(dir, { recursive: true });
  const itemsPath = path.join(dir, "items.json");

  const raw = fs.existsSync(itemsPath) ? fs.readFileSync(itemsPath, "utf8") : "[]";
  const items: Fact[] = JSON.parse(raw);

  const now = new Date().toISOString();
  const newFact: Fact = {
    id: `fact-${Date.now()}`,
    fact,
    source,
    createdAt: now,
    lastAccessed: now,
    accessCount: 1,
    supersededBy: null,
  };

  items.push(newFact);
  fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), "utf8");
  appendSummaryFact(dir, newFact.fact, newFact.createdAt);

  return newFact;
}

function appendSummaryFact(dir: string, fact: string, createdAt: string): void {
  const summaryPath = path.join(dir, "summary.md");
  if (!fs.existsSync(summaryPath)) {
    return;
  }
  const content = fs.readFileSync(summaryPath, "utf8");
  const marker = "## 記憶";
  const line = `- ${createdAt}: ${fact}`;
  if (content.includes(marker)) {
    const updated = content.replace(marker, `${marker}\n${line}`);
    fs.writeFileSync(summaryPath, updated, "utf8");
    return;
  }
  fs.writeFileSync(summaryPath, `${content}\n\n${marker}\n${line}\n`, "utf8");
}

export function addRelation(type: EntityType, name: string, relation: string): void {
  const dir = getEntityDir(type, name);
  const summaryPath = path.join(dir, "summary.md");
  if (!fs.existsSync(summaryPath)) {
    return;
  }
  const content = fs.readFileSync(summaryPath, "utf8");
  const marker = "## 関連";
  if (content.includes(marker)) {
    const updated = content.replace(marker, `${marker}\n- ${relation}`);
    fs.writeFileSync(summaryPath, updated, "utf8");
    return;
  }
  fs.writeFileSync(summaryPath, `${content}\n\n${marker}\n- ${relation}\n`, "utf8");
}

export function supersedeFact(
  type: EntityType,
  name: string,
  oldFactId: string,
  newFact: string,
  source: string
): Fact | null {
  const dir = getEntityDir(type, name);
  const itemsPath = path.join(dir, "items.json");
  if (!fs.existsSync(itemsPath)) {
    return null;
  }
  const items: Fact[] = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const target = items.find((item) => item.id === oldFactId);
  const created = addFact(type, name, newFact, source);
  if (target) {
    target.supersededBy = created.id;
    fs.writeFileSync(itemsPath, JSON.stringify(items, null, 2), "utf8");
  }
  return created;
}

export function getEntity(type: EntityType, name: string): Entity | null {
  const dir = getEntityDir(type, name);
  const summaryPath = path.join(dir, "summary.md");
  const itemsPath = path.join(dir, "items.json");

  if (!fs.existsSync(summaryPath) || !fs.existsSync(itemsPath)) {
    return null;
  }

  const summary = fs.readFileSync(summaryPath, "utf8");
  const facts: Fact[] = JSON.parse(fs.readFileSync(itemsPath, "utf8"));

  return {
    name,
    type,
    summary,
    facts,
    related: [],
  };
}

export function listEntities(type?: EntityType): Entity[] {
  const categories: Array<{ type: EntityType; dir: string }> = type
    ? [{ type, dir: getCategory(type) }]
    : [
        { type: "project", dir: getCategory("project") },
        { type: "person", dir: getCategory("person") },
        { type: "resource", dir: getCategory("resource") },
      ];

  const entities: Entity[] = [];

  for (const category of categories) {
    const baseDir = path.join(KNOWLEDGE_DIR, category.dir);
    if (!fs.existsSync(baseDir)) continue;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      const entity = getEntity(category.type, name);
      if (entity) {
        entities.push(entity);
      }
    }
  }

  return entities;
}

export function getLatestPersonMemory(): { name: string; facts: string[] } | null {
  const peopleDir = path.join(KNOWLEDGE_DIR, "areas", "people");
  if (!fs.existsSync(peopleDir)) {
    return null;
  }

  const entries = fs.readdirSync(peopleDir, { withFileTypes: true });
  let latest: { dir: string; mtimeMs: number } | null = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(peopleDir, entry.name);
    const itemsPath = path.join(dir, "items.json");
    if (!fs.existsSync(itemsPath)) continue;
    const stat = fs.statSync(itemsPath);
    if (!latest || stat.mtimeMs > latest.mtimeMs) {
      latest = { dir, mtimeMs: stat.mtimeMs };
    }
  }

  if (!latest) {
    return null;
  }

  const itemsPath = path.join(latest.dir, "items.json");
  const summaryPath = path.join(latest.dir, "summary.md");
  const items: Fact[] = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
  const facts = items.map((item) => item.fact);

  let name = path.basename(latest.dir);
  if (fs.existsSync(summaryPath)) {
    const firstLine = fs.readFileSync(summaryPath, "utf8").split("\n")[0];
    if (firstLine.startsWith("# ")) {
      name = firstLine.replace(/^#\\s+/, "").trim() || name;
    }
  }

  return { name, facts };
}
