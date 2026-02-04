export type EntityType = "project" | "person" | "resource" | "decision" | "fact";

export interface Fact {
  id: string;
  fact: string;
  source: string;
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  supersededBy: string | null;
}

export interface Entity {
  name: string;
  type: EntityType;
  summary: string;
  facts: Fact[];
  related: string[];
}

export interface SearchResult {
  entity: string;
  snippet: string;
  score: number;
  source: string;
}
