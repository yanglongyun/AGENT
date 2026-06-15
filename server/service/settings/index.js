// @ts-nocheck
import { getSettings, setSettings } from "../../repository/settings/index.js";

const DEFAULTS = {
  provider: process.env.LLM_PROVIDER || "openai",
  apiUrl: process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4.1-mini",
  system: process.env.AGENT_SYSTEM_PROMPT || "",
  evolution: process.env.AGENT_EVOLUTION_PROMPT || "",
  compressThreshold: process.env.AGENT_COMPRESS_THRESHOLD || "12000",
  compactPrompt: process.env.AGENT_COMPACT_PROMPT || "",
  toolResultMaxChars: process.env.AGENT_TOOL_RESULT_MAX_CHARS || "12000",
  toolVision: process.env.AGENT_TOOL_VISION || "0",
  theme: process.env.AGENT_THEME || "light",
  language: process.env.AGENT_LANGUAGE || "zh",
};

const getServerSettings = () => ({
  ...DEFAULTS,
  ...getSettings(),
});

const normalizeSettingValue = (key, value) => {
  if (key === "toolResultMaxChars") {
    return String(Math.max(1000, Math.min(50000, Number(value) || 12000)));
  }
  return String(value);
};

const updateServerSettings = (settings = {}) => {
  const allowed = ["provider", "apiUrl", "apiKey", "model", "system", "evolution", "compressThreshold", "compactPrompt", "toolResultMaxChars", "toolVision", "theme", "language"];
  const next = {};
  for (const key of allowed) {
    if (settings[key] != null) next[key] = normalizeSettingValue(key, settings[key]);
  }
  setSettings(next);
  return getServerSettings();
};

export { getServerSettings, updateServerSettings };
