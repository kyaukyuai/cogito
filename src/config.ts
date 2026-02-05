export type CogitoMode = "stable" | "learning" | "full";

const rawMode = (process.env.COGITO_MODE ?? "full").toLowerCase();
const mode: CogitoMode = rawMode === "learning" || rawMode === "stable" ? rawMode : "full";

const base = {
  qmd: true,
  realtime: true,
  embed: false,
  consolidate: false,
  learning: false,
  skillGen: false,
};

if (mode === "learning") {
  base.learning = true;
  base.skillGen = true;
}

if (mode === "full") {
  base.learning = true;
  base.skillGen = true;
  base.embed = true;
  base.consolidate = true;
}

const enableQmd = process.env.COGITO_ENABLE_QMD !== undefined ? process.env.COGITO_ENABLE_QMD === "1" : base.qmd;
const enableRealtime =
  process.env.COGITO_ENABLE_REALTIME !== undefined
    ? process.env.COGITO_ENABLE_REALTIME === "1"
    : base.realtime;
const enableEmbed =
  process.env.COGITO_ENABLE_EMBED !== undefined
    ? process.env.COGITO_ENABLE_EMBED === "1"
    : base.embed;
const enableConsolidate =
  process.env.COGITO_ENABLE_CONSOLIDATE !== undefined
    ? process.env.COGITO_ENABLE_CONSOLIDATE === "1"
    : base.consolidate;
const enableLearning =
  process.env.COGITO_ENABLE_LEARNING !== undefined
    ? process.env.COGITO_ENABLE_LEARNING === "1"
    : base.learning;
const enableSkillGen =
  process.env.COGITO_ENABLE_SKILL_GEN !== undefined
    ? process.env.COGITO_ENABLE_SKILL_GEN === "1"
    : base.skillGen;

export const COGITO_MODE = mode;
export const ENABLE_QMD = enableQmd;
export const ENABLE_REALTIME = enableRealtime;
export const ENABLE_EMBED = enableEmbed;
export const ENABLE_CONSOLIDATE = enableConsolidate;
export const ENABLE_LEARNING = enableLearning;
export const ENABLE_SKILL_GEN = enableSkillGen;
const allowSkillWrite =
  process.env.COGITO_ALLOW_SKILL_WRITE !== undefined
    ? process.env.COGITO_ALLOW_SKILL_WRITE === "1"
    : true;

export const ALLOW_SKILL_WRITE = allowSkillWrite;
export const KNOWLEDGE_GAP_THRESHOLD = Number(process.env.COGITO_KNOWLEDGE_GAP_THRESHOLD ?? "0.7");
