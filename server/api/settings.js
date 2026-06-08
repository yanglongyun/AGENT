// @ts-nocheck
import { getServerSettings, updateServerSettings } from "../service/settings/index.js";
import { listLlmProviderGroups, listLlmProviders } from "../ai/llm/models.js";
import { readJsonBody } from "../utils/http.js";

const maskSettings = (settings) => ({
  ...settings,
  apiKey: settings.apiKey ? "********" : "",
});

const handleSettingsApi = async (req, res, { sendJson }, path, method) => {
  if (path === "/api/settings/models" && method === "GET") {
    sendJson(res, 200, {
      ok: true,
      groups: listLlmProviderGroups(),
      providers: listLlmProviders(),
    });
    return;
  }

  if (path !== "/api/settings") {
    sendJson(res, 404, { error: "API endpoint not found" });
    return;
  }
  if (method === "GET") {
    sendJson(res, 200, maskSettings(getServerSettings()));
    return;
  }
  if (method === "POST") {
    const body = await readJsonBody(req);
    const current = getServerSettings();
    const next = { ...body };
    if (next.apiKey === "********") next.apiKey = current.apiKey;
    sendJson(res, 200, maskSettings(updateServerSettings(next)));
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
};

export { handleSettingsApi };
