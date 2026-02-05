import type { SearchResult as QmdSearchResult, Store } from "qmd/src/store";
import type { SearchResult } from "../memory/types.js";
import path from "node:path";

function mergeResults(a: QmdSearchResult[], b: QmdSearchResult[]): QmdSearchResult[] {
  const seen = new Set<string>();
  const merged: QmdSearchResult[] = [];
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

export async function searchWithEmbeddings(
  store: Store,
  query: string,
  limit: number,
  ftsResults: QmdSearchResult[]
): Promise<SearchResult[]> {
  const vecResults = await store.searchVec(query, "embeddinggemma", limit * 2);
  const merged = mergeResults(ftsResults, vecResults);

  if (merged.length === 0) {
    return [];
  }

  const reranked = await store.rerank(
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

export async function runEmbeddingUpdate(
  runQmd: (args: string[]) => Promise<void>,
  needsEmbedding: number
): Promise<void> {
  if (needsEmbedding > 0) {
    await runQmd(["embed"]);
  }
}
