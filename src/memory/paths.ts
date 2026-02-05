import path from "node:path";

export const KNOWLEDGE_DIR = path.resolve(process.cwd(), "knowledge");
export const DAILY_DIR = path.join(KNOWLEDGE_DIR, "memory");
export const LONG_TERM_PATH = path.join(KNOWLEDGE_DIR, "MEMORY.md");
export const PROFILE_PATH = path.join(KNOWLEDGE_DIR, "profile.json");
export const USER_MD_PATH = path.join(process.cwd(), "USER.md");
