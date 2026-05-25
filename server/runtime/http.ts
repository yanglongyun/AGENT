// @ts-nocheck
import http from "http";
import { createApiHandler } from "../api/index.js";

let serverInstance = null;

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
};

const openSse = (res) => {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
};

const sendSse = (res, event, payload) => {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // connection closed
  }
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const handleRequest = createApiHandler({
  openSse,
  readBody,
  sendJson,
  sendSse,
});

const startServer = async (port = 9500) => {
  return new Promise((resolve, reject) => {
    serverInstance = http.createServer(async (req, res) => {
      try {
        await handleRequest(req, res, port);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error.message });
      }
    });

    serverInstance.listen(port, "127.0.0.1", () => {
      console.log(`AGENT server running on http://127.0.0.1:${port}`);
      resolve(serverInstance);
    });

    serverInstance.on("error", reject);
  });
};

const stopServer = async () => {
  if (!serverInstance) return undefined;
  return new Promise((resolve) => {
    serverInstance.close(() => resolve());
  });
};

export { startServer, stopServer };
