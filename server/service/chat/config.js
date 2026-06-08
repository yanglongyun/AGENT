// @ts-nocheck
import { getServerSettings } from "../settings/index.js";

const getChatRunConfig = (input = {}) => {
  const settings = getServerSettings();
  const config = {
    apiUrl: input.apiUrl || settings.apiUrl || "",
    apiKey: input.apiKey || settings.apiKey || "",
    model: input.model || settings.model || "",
    provider: input.provider || settings.provider || "",
    system: input.system || settings.system || "",
    evolution: input.evolution ?? settings.evolution ?? "",
    contextTurns: input.contextTurns ?? settings.contextTurns ?? 100,
    toolVision: input.toolVision ?? settings.toolVision ?? "0",
  };
  const missing = [];
  if (!config.apiUrl) missing.push("apiUrl");
  if (!config.apiKey) missing.push("apiKey");
  if (!config.model) missing.push("model");
  if (missing.length) throw new Error(`Missing required settings: ${missing.join(", ")}`);
  return config;
};

export { getChatRunConfig };
