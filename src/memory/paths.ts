import path from "node:path";
import os from "node:os";

const rawHome = process.env.COGITO_HOME?.trim();
const expandedHome = rawHome?.startsWith("~/")
  ? path.join(os.homedir(), rawHome.slice(2))
  : rawHome;
export const COGITO_HOME =
  expandedHome && expandedHome.length > 0 ? path.resolve(expandedHome) : process.cwd();

export const KNOWLEDGE_DIR = path.join(COGITO_HOME, "knowledge");
export const DAILY_DIR = path.join(KNOWLEDGE_DIR, "memory");
export const LONG_TERM_PATH = path.join(KNOWLEDGE_DIR, "MEMORY.md");
export const PROFILE_PATH = path.join(KNOWLEDGE_DIR, "profile.json");
export const QMD_DIR = path.join(COGITO_HOME, ".qmd");
export const USER_MD_PATH = path.join(process.cwd(), "USER.md");
