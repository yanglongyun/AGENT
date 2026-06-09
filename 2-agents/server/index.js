#!/usr/bin/env node
// @ts-nocheck
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
} from "./conversations.js";
import { listMessages, clearMessages } from "./messages.js";
import { getSettings, setSettings } from "./settings.js";
import { defaultBase } from "./prompt.js";
import { sendJson, sendStatic, readJsonBody } from "./http.js";
import { attachWebSocketServer } from "./ws.js";
import { sendMessage, abort, isRunning } from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const port = Number(process.env.AGENT_PORT || 9500);
const distRoot = path.join(root, "dist");
const staticRoot = fs.existsSync(distRoot) ? distRoot : root;

initDb();

// /api/conversations          GET 列表 / POST 新建
// /api/conversations/:id      GET 详情 / PATCH 改 / DELETE 删
// /api/conversations/:id/messages   GET 历史 / POST 发消息(触发循环) / DELETE 清空
// /api/conversations/:id/abort      POST 中断当前循环
const matchConversationRoute = (pathname) => {
  if (pathname === "/api/conversations") return { kind: "collection" };
  const m = pathname.match(/^\/api\/conversations\/(\d+)(\/messages|\/abort)?$/);
  if (!m) return null;
  const id = Number(m[1]);
  const sub = m[2];
  if (sub === "/messages") return { kind: "messages", id };
  if (sub === "/abort") return { kind: "abort", id };
  return { kind: "item", id };
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const { pathname } = url;
  const method = String(req.method || "GET").toUpperCase();

  try {
    if (pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // 设置
    if (pathname === "/api/settings" && method === "GET") {
      sendJson(res, 200, { ...getSettings(), systemDefault: defaultBase });
      return;
    }
    if (pathname === "/api/settings" && method === "POST") {
      const body = await readJsonBody(req).catch(() => ({}));
      sendJson(res, 200, setSettings(body));
      return;
    }

    // 对话相关
    const route = matchConversationRoute(pathname);
    if (route) {
      if (route.kind === "collection" && method === "GET") {
        sendJson(res, 200, { conversations: listConversations() });
        return;
      }
      if (route.kind === "collection" && method === "POST") {
        const body = await readJsonBody(req).catch(() => ({}));
        const conversation = createConversation(body);
        sendJson(res, 200, { conversation });
        return;
      }
      if (route.kind === "item" && method === "GET") {
        const conversation = getConversation(route.id);
        if (!conversation) { sendJson(res, 404, { error: "not found" }); return; }
        sendJson(res, 200, { conversation });
        return;
      }
      if (route.kind === "item" && method === "PATCH") {
        const body = await readJsonBody(req).catch(() => ({}));
        const conversation = updateConversation(route.id, body);
        sendJson(res, 200, { conversation });
        return;
      }
      if (route.kind === "item" && method === "DELETE") {
        deleteConversation(route.id);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (route.kind === "messages" && method === "GET") {
        sendJson(res, 200, { messages: listMessages(route.id) });
        return;
      }
      if (route.kind === "messages" && method === "POST") {
        // 关键:写消息 + 触发对话跑一轮。不阻塞返回——事件流走 WS。
        const body = await readJsonBody(req).catch(() => ({}));
        const role = body.role === "user" || body.role === "system" ? body.role : "user";
        // 跨 agent 通讯时可以带 from(说明谁发的),拼到 content 开头让模型看见。
        const from = String(body.from || "").trim();
        const raw = String(body.content || "");
        const content = from ? `[来自 ${from}] ${raw}` : raw;
        // 不 await:HTTP 立刻返回,循环在后台跑。
        sendMessage(route.id, { role, content }).catch((err) => {
          console.error(`sendMessage failed for #${route.id}:`, err.message);
        });
        sendJson(res, 202, { ok: true, accepted: true });
        return;
      }
      if (route.kind === "messages" && method === "DELETE") {
        clearMessages(route.id);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (route.kind === "abort" && method === "POST") {
        const aborted = abort(route.id);
        sendJson(res, 200, { ok: true, aborted });
        return;
      }
    }

    if (pathname === "/ws") {
      sendJson(res, 426, { error: "WebSocket upgrade required" });
      return;
    }
    await sendStatic(req, res, staticRoot);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

attachWebSocketServer(server);

server.listen(port, "127.0.0.1", () => {
  console.log(`2-agents running on http://127.0.0.1:${port}`);
});
