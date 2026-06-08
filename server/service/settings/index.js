// @ts-nocheck
import { getSettings, setSettings } from "../../repository/settings/index.js";

const DEFAULTS = {
  provider: process.env.LLM_PROVIDER || "openai",
  apiUrl: process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4.1-mini",
  system: process.env.AGENT_SYSTEM_PROMPT || "",
  evolution: process.env.AGENT_EVOLUTION_PROMPT || "",
  contextTurns: process.env.AGENT_CONTEXT_TURNS || "100",
  toolVision: process.env.AGENT_TOOL_VISION || "0",
  theme: process.env.AGENT_THEME || "light",
  language: process.env.AGENT_LANGUAGE || "zh",
};

const getServerSettings = () => ({
  ...DEFAULTS,
  ...getSettings(),
});

const updateServerSettings = (settings = {}) => {
  const allowed = ["provider", "apiUrl", "apiKey", "model", "system", "evolution", "contextTurns", "toolVision", "theme", "language"];
  const next = {};
  for (const key of allowed) {
    if (settings[key] != null) next[key] = String(settings[key]);
  }
  setSettings(next);
  return getServerSettings();
};

export { getServerSettings, updateServerSettings };
