import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createStore, type Store } from "qmd/src/store";
import type { SearchResult } from "./types.js";
import { ENABLE_EMBED, ENABLE_QMD } from "../config.js";
import { KNOWLEDGE_DIR } from "./paths.js";

let store: Store | null = null;

const QMD_DIR = path.resolve(process.cwd(), ".qmd");
const DB_PATH = path.join(QMD_DIR, "cogito.sqlite");
const QMD_BIN = path.resolve(process.cwd(), "node_modules", "qmd", "qmd");
const COLLECTION_NAME = "knowledge";
const QMD_CONFIG = path.join(QMD_DIR, "index.yml");

function getStore(): Store {
  if (!store) {
    if (!ENABLE_QMD) {
      throw new Error("QMD is disabled");
    }
    if (!fs.existsSync(QMD_DIR)) {
      fs.mkdirSync(QMD_DIR, { recursive: true });
    }
    store = createStore(DB_PATH);
  }
  return store;
}

function closeStore(): void {
  if (store) {
    store.close();
    store = null;
  }
}

function runQmd(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(QMD_BIN, args, {
      env: {
        ...process.env,
        QMD_CONFIG_DIR: QMD_DIR,
        INDEX_PATH: DB_PATH,
      },
      stdio: "pipe",
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `qmd exited with code ${code}`));
    });
  });
}

function mergeResults<T extends { filepath: string }>(
  a: T[],
  b: T[]
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const item of [...a, ...b]) {
    if (seen.has(item.filepath)) continue;
    seen.add(item.filepath);
    merged.push(item);
  }
  return merged;
}

function extractEntityName(filePath: string): string {
  const parts = filePath.split(path.sep);
  return parts[parts.length - 2] ?? filePath;
}

export async function search(query: string, limit = 5): Promise<SearchResult[]> {
  if (!ENABLE_QMD) {
    return [];
  }
  const s = getStore();

  const ftsResults = s.searchFTS(query, limit * 2);
  if (!ENABLE_EMBED) {
    return ftsResults.slice(0, limit).map((r) => ({
      entity: extractEntityName(r.filepath),
      snippet: r.snippet,
      score: r.score,
      source: r.filepath,
    }));
  }

  const vecResults = await s.searchVec(query, "embeddinggemma", limit * 2);
  const merged = mergeResults(ftsResults, vecResults);

  if (merged.length === 0) {
    return [];
  }

  const reranked = await s.rerank(
    query,
    merged.map((r) => ({ file: r.filepath, text: r.snippet }))
  );

  return reranked.slice(0, limit).map((r) => {
    const source = r.file;
    const snippet = merged.find((m) => m.filepath === source)?.snippet ?? "";
    return {
      entity: extractEntityName(source),
      snippet,
      score: r.score,
      source,
    };
  });
}

export async function searchFTSOnly(query: string, limit = 5): Promise<SearchResult[]> {
  if (!ENABLE_QMD) {
    return [];
  }
  const s = getStore();
  const ftsResults = s.searchFTS(query, limit);
  return ftsResults.map((r) => ({
    entity: extractEntityName(r.filepath),
    snippet: r.snippet,
    score: r.score,
    source: r.filepath,
  }));
}

export async function updateIndex(): Promise<void> {
  if (!ENABLE_QMD) {
    return;
  }
  if (!fs.existsSync(QMD_DIR)) {
    fs.mkdirSync(QMD_DIR, { recursive: true });
  }

  const configExists = fs.existsSync(QMD_CONFIG);
  if (!configExists) {
    await runQmd(["collection", "add", KNOWLEDGE_DIR, "--name", COLLECTION_NAME, "--mask", "**/*.md"]);
  } else {
    try {
      await runQmd(["update"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already exists")) {
        await runQmd(["update"]);
      } else {
        throw error;
      }
    }
  }

  // Embed only if needed
  const storeAfter = getStore();
  const needsEmbedding = storeAfter.getHashesNeedingEmbedding();
  closeStore();

  if (ENABLE_EMBED && needsEmbedding > 0) {
    await runQmd(["embed"]);
  }
}
