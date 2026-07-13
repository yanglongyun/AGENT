#!/usr/bin/env node
// @ts-nocheck
import http from "node:http";
import { createApiHandler } from "./api/index.js";
import { initDb } from "./repository/db.js";
import { sendJson, sendStatic } from "./utils/http.js";
import { attachRealtimeWebSocketServer } from "./ws/index.js";
import {
  PACKAGED,
  STATIC_ROOT,
  initializeRuntime,
  openExternal,
  readStaticAsset,
  runtimeInfo,
} from "./runtime/index.js";

const port = Number(process.env.AGENT_PORT || 9500);
const handleApi = createApiHandler({ sendJson });

initializeRuntime();
initDb();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/ws") {
    sendJson(res, 426, { error: "WebSocket upgrade required" });
    return;
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    await handleApi(req, res);
    return;
  }
  await sendStatic(req, res, STATIC_ROOT, PACKAGED ? readStaticAsset : null);
});

attachRealtimeWebSocketServer(server);

server.on("error", (error) => {
  if (PACKAGED && error?.code === "EADDRINUSE") {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Agent Chat is already running on ${url}`);
    openExternal(url);
    setTimeout(() => process.exit(0), 500);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  const info = runtimeInfo();
  console.log(`Agent Chat server running on ${url}`);
  console.log(`Data: ${info.dataRoot}`);
  console.log(`Workspace: ${info.workspaceRoot}`);
  if (PACKAGED) openExternal(url);
});
