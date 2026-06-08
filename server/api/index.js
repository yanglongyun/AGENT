// @ts-nocheck
import { handleChatApi } from "./chat.js";
import { handleFsApi } from "./fs.js";
import { handleSettingsApi } from "./settings.js";
import { handleTasksApi } from "./tasks.js";

const createApiHandler = ({ sendJson }) => async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = String(req.method || "GET").toUpperCase();
  const deps = { sendJson };

  try {
    if (path === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (path.startsWith("/api/chat")) {
      await handleChatApi(req, res, deps, path, method, url);
      return;
    }
    if (path.startsWith("/api/settings")) {
      await handleSettingsApi(req, res, deps, path, method, url);
      return;
    }
    if (path.startsWith("/api/tasks")) {
      await handleTasksApi(req, res, deps, path, method, url);
      return;
    }
    if (path.startsWith("/api/fs")) {
      await handleFsApi(req, res, deps, path, method, url);
      return;
    }
    sendJson(res, 404, { error: "API endpoint not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};

export { createApiHandler };
