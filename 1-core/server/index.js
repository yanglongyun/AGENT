#!/usr/bin/env node
// @ts-nocheck
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { listMessages, clearMessages } from "./messages.js";
import { getSettings, setSettings } from "./settings.js";
import { defaultInstruction } from "./prompt.js";
import { sendJson, sendStatic, readJsonBody } from "./http.js";
import { attachWebSocketServer } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const port = Number(process.env.AGENT_PORT || 9500);
const distRoot = path.join(root, "dist");
const staticRoot = fs.existsSync(distRoot) ? distRoot : root;

initDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  const { pathname } = url;

  if (pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  // 单对话历史:前端启动时拉一次。
  if (pathname === "/api/messages" && req.method === "GET") {
    sendJson(res, 200, { messages: listMessages() });
    return;
  }
  if (pathname === "/api/messages" && req.method === "POST") {
    await readJsonBody(req).catch(() => ({}));
    clearMessages();
    sendJson(res, 200, { ok: true });
    return;
  }
  // 设置:模型配置 + 系统提示词。
  if (pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, 200, { ...getSettings(), systemDefault: defaultInstruction });
    return;
  }
  if (pathname === "/api/settings" && req.method === "POST") {
    const body = await readJsonBody(req).catch(() => ({}));
    sendJson(res, 200, setSettings(body));
    return;
  }
  if (pathname === "/ws") {
    sendJson(res, 426, { error: "WebSocket upgrade required" });
    return;
  }
  await sendStatic(req, res, staticRoot);
});

attachWebSocketServer(server);

server.listen(port, "127.0.0.1", () => {
  console.log(`1-core running on http://127.0.0.1:${port}`);
});
