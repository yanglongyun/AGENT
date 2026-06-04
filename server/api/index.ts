// @ts-nocheck
import { handleChatsApi } from "./chats/index.js";
import { handleHealthApi } from "./health/index.js";
import { handleMemoriesApi } from "./memories/index.js";
import { handleMemosApi } from "./memos/index.js";
import { handleObjectivesApi } from "./objectives/index.js";
import { handleMessagesApi } from "./messages/index.js";
import { handleSettingsApi } from "./settings/index.js";
import { handleSkillsApi } from "./skills/index.js";
import { handleTasksApi } from "./tasks/index.js";
import { serveGui } from "../runtime/static.js";

const ROUTES = [
  { prefix: "/api/chats", handler: handleChatsApi },
  { prefix: "/api/memories", handler: handleMemoriesApi },
  { prefix: "/api/memos", handler: handleMemosApi },
  { prefix: "/api/objectives", handler: handleObjectivesApi },
  { prefix: "/api/messages", handler: handleMessagesApi },
  { prefix: "/api/settings", handler: handleSettingsApi },
  { prefix: "/api/skills", handler: handleSkillsApi },
  { prefix: "/api/tasks", handler: handleTasksApi },
];

const handleApiRequest = async (req, res, deps, context = {}) => {
  const { sendJson } = deps;
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method;

  try {
    if (path === "/health") {
      return handleHealthApi(req, res, deps, path, method, url, context);
    }
    for (const route of ROUTES) {
      if (path === route.prefix || path.startsWith(`${route.prefix}/`)) {
        return route.handler(req, res, deps, path, method, url, context);
      }
    }
    // 未匹配的 /api 路径返回 JSON 404;其余路径交给 GUI 静态服务(SPA)
    if (path === "/api" || path.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }
    return serveGui(req, res, path);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
};

const createApiHandler = (deps) => async (req, res, port) =>
  handleApiRequest(req, res, deps, { port });

export { createApiHandler, handleApiRequest };
