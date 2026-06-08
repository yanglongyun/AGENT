// @ts-nocheck
import { createUpdate, listUpdates } from "../service/updates/index.js";
import { readJsonBody } from "../utils/http.js";

const readLimit = (value) => Math.max(1, Math.min(500, Number.parseInt(value, 10) || 100));

const handleUpdatesApi = async (req, res, { sendJson }, path, method, url) => {
  if (path !== "/api/updates") {
    sendJson(res, 404, { error: "API endpoint not found" });
    return;
  }

  if (method === "GET") {
    sendJson(res, 200, { ok: true, updates: listUpdates({ limit: readLimit(url.searchParams.get("limit")) }) });
    return;
  }

  if (method === "POST") {
    const body = await readJsonBody(req);
    sendJson(res, 201, { ok: true, update: createUpdate(body) });
    return;
  }

  sendJson(res, 404, { error: "API endpoint not found" });
};

export { handleUpdatesApi };
