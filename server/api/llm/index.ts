// @ts-nocheck
import { getProviderCatalog } from "../../../llm/index.js";

const handleLlmApi = async (_req, res, { sendJson }, _path, method, url) => {
  if (url.pathname === "/api/llm/providers" && method === "GET") {
    sendJson(res, 200, { ok: true, ...getProviderCatalog() });
    return;
  }
  sendJson(res, 404, { ok: false, error: "Not found" });
};

export { handleLlmApi };
