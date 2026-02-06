import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createStore, type Store, type SearchResult as QmdSearchResult } from "qmd/src/store";
import type { SearchResult } from "./types.js";
import { ENABLE_EMBED, ENABLE_QMD } from "../config.js";
import { KNOWLEDGE_DIR, QMD_DIR } from "./paths.js";

let store: Store | null = null;

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
    ensureConfigMatchesPath();
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

function ensureConfigMatchesPath(): void {
  if (!fs.existsSync(QMD_CONFIG)) {
    return;
  }
  try {
    const raw = fs.readFileSync(QMD_CONFIG, "utf8");
    if (raw.includes(KNOWLEDGE_DIR)) {
      return;
    }
    // Config points to a different path (e.g., host path). Reset index in this environment.
    fs.rmSync(QMD_DIR, { recursive: true, force: true });
    fs.mkdirSync(QMD_DIR, { recursive: true });
  } catch {
    // Best-effort; if reset fails, proceed and let qmd error surface.
  }
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

  const ftsResults = s.searchFTS(query, limit * 2) as QmdSearchResult[];
  if (!ENABLE_EMBED) {
    return ftsResults.slice(0, limit).map((r) => ({
      entity: extractEntityName(r.filepath),
      snippet: r.snippet,
      score: r.score,
      source: r.filepath,
    }));
  }

  try {
    const { searchWithEmbeddings } = await import("../extensions/embeddings.js");
    return await searchWithEmbeddings(s, query, limit, ftsResults);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Embedding search failed, falling back to FTS: ${message}`);
    return ftsResults.slice(0, limit).map((r) => ({
      entity: extractEntityName(r.filepath),
      snippet: r.snippet,
      score: r.score,
      source: r.filepath,
    }));
  }
}

export async function searchFTSOnly(query: string, limit = 5): Promise<SearchResult[]> {
  if (!ENABLE_QMD) {
    return [];
  }
  const s = getStore();
  const ftsResults = s.searchFTS(query, limit) as QmdSearchResult[];
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
  ensureConfigMatchesPath();

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
    const { runEmbeddingUpdate } = await import("../extensions/embeddings.js");
    await runEmbeddingUpdate(runQmd, needsEmbedding);
  }
}
