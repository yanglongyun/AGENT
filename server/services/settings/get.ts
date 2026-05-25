// @ts-nocheck
import { getSettingsRecord } from "../../repository/settings/index.js";

const getServerSettings = () => {
  try {
    const settings = getSettingsRecord();
    return {
      provider: settings.provider || "deepseek",
      apiUrl: settings.apiUrl || "",
      apiKey: settings.apiKey || "",
      model: settings.model || "",
      system: settings.system || "",
      contextTurns: Number.isInteger(Number(settings.contextTurns)) ? Number(settings.contextTurns) : 100,
    };
  } catch {
    return {
      provider: "deepseek",
      apiUrl: "",
      apiKey: "",
      model: "",
      system: "",
      contextTurns: 100
    };
  }
};

export { getServerSettings };
