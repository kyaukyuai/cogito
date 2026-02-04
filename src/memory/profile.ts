import fs from "node:fs";
import path from "node:path";

export interface UserProfile {
  name?: string;
  updatedAt?: string;
  source?: string;
}

const KNOWLEDGE_DIR = path.resolve(process.cwd(), "knowledge");
const PROFILE_PATH = path.join(KNOWLEDGE_DIR, "profile.json");
const USER_MD_PATH = path.join(process.cwd(), "USER.md");

function ensureDir(): void {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
}

export function loadProfile(): UserProfile {
  try {
    if (!fs.existsSync(PROFILE_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(PROFILE_PATH, "utf8");
    return JSON.parse(raw) as UserProfile;
  } catch {
    return {};
  }
}

export function saveProfile(profile: UserProfile): void {
  ensureDir();
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
  syncUserMd(profile);
}

export function setUserName(name: string, source: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const profile = loadProfile();
  profile.name = trimmed;
  profile.updatedAt = new Date().toISOString();
  profile.source = source;
  saveProfile(profile);
}

export function getUserName(): string | null {
  const profile = loadProfile();
  return profile.name ?? null;
}

function syncUserMd(profile: UserProfile): void {
  const lines = [
    "# USER",
    "",
    profile.name ? `- name: ${profile.name}` : "- name: ",
    profile.updatedAt ? `- updated_at: ${profile.updatedAt}` : "- updated_at: ",
    profile.source ? `- source: ${profile.source}` : "- source: ",
  ];
  fs.writeFileSync(USER_MD_PATH, lines.join("\n"), "utf8");
}

export function extractNameFromText(text: string): string | null {
  const patterns = [
    /(?:私|わたし|僕|俺)は\s*([\p{L}\p{N}_-]{2,})\s*です/iu,
    /(?:名前|氏名)は\s*([\p{L}\p{N}_-]{2,})/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}
