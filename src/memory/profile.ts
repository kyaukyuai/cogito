import fs from "node:fs";
import { KNOWLEDGE_DIR, PROFILE_PATH, USER_MD_PATH } from "./paths.js";

export interface UserProfile {
  name?: string;
  updatedAt?: string;
  source?: string;
}

const PROFILE_DIR = KNOWLEDGE_DIR;

function ensureDir(): void {
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
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
    "_This file is auto-generated from knowledge/profile.json. Do not edit manually._",
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
