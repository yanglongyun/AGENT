// @ts-nocheck
import WebSocket, { WebSocketServer } from "ws";
import { runConversationChat } from "../services/chat/index.js";
import { normalizeConversationId } from "../services/chats/index.js";

const WS_PATH = "/api/ws";

const sendJson = (ws, payload) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
};

const createRealtimeRuntime = () => {
  const clients = new Set();
  const runningChats = new Map();

  const broadcast = (conversationId, payload) => {
    for (const client of clients) {
      if (!client.subscriptions.has(conversationId)) continue;
      sendJson(client.ws, { conversationId, ...payload });
    }
  };

  const subscribe = (client, conversationId) => {
    client.subscriptions.add(conversationId);
    sendJson(client.ws, {
      type: "chat.subscribed",
      ok: true,
      conversationId,
    });
  };

  const unsubscribe = (client, conversationId) => {
    client.subscriptions.delete(conversationId);
    sendJson(client.ws, {
      type: "chat.unsubscribed",
      ok: true,
      conversationId,
    });
  };

  const stopChat = (conversationId) => {
    const controller = runningChats.get(conversationId);
    if (controller) controller.abort();
  };

  const runChat = async (client, payload) => {
    const conversationId = normalizeConversationId(payload.conversationId);
    const prompt = String(payload.prompt || "").trim();

    subscribe(client, conversationId);

    if (runningChats.has(conversationId)) {
      sendJson(client.ws, {
        type: "chat.error",
        ok: false,
        conversationId,
        error: "chat already running",
      });
      return;
    }

    const controller = new AbortController();
    runningChats.set(conversationId, controller);

    if (prompt) {
      broadcast(conversationId, {
        type: "chat.message",
        ok: true,
        message: { role: "user", content: prompt },
      });
    }

    try {
      await runConversationChat(conversationId, payload, {
        signal: controller.signal,
        onEvent: (event) => {
          if (
            event.type === "assistant_tool_calls" ||
            event.type === "tool_result" ||
            event.type === "done"
          ) {
            broadcast(conversationId, {
              type: "chat.message",
              ok: true,
              message: event.message,
            });
            return;
          }

          if (event.type === "usage") {
            broadcast(conversationId, {
              type: "chat.usage",
              ok: true,
              usage: event.usage,
            });
            return;
          }

          if (event.type === "saved") {
            broadcast(conversationId, {
              type: "chat.saved",
              ok: true,
            });
            return;
          }

          if (event.type === "end") {
            broadcast(conversationId, {
              type: "chat.end",
              ok: true,
            });
            return;
          }

          if (event.type === "stopped") {
            broadcast(conversationId, {
              type: "chat.stopped",
              ok: true,
            });
          }
        },
      });
    } catch (error) {
      if (error?.name !== "AbortError") {
        broadcast(conversationId, {
          type: "chat.error",
          ok: false,
          error: error.message,
        });
      }
    } finally {
      runningChats.delete(conversationId);
    }
  };

  const bindConnection = (ws) => {
    const client = {
      ws,
      subscriptions: new Set(),
    };
    clients.add(client);

    sendJson(ws, { type: "socket.connected", ok: true });

    ws.on("message", async (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw || "{}"));
      } catch (error) {
        sendJson(ws, { type: "socket.error", ok: false, error: error.message });
        return;
      }

      const type = String(payload.type || "");
      if (type === "chat.subscribe") {
        subscribe(client, normalizeConversationId(payload.conversationId));
        return;
      }
      if (type === "chat.unsubscribe") {
        unsubscribe(client, normalizeConversationId(payload.conversationId));
        return;
      }
      if (type === "chat.stop") {
        stopChat(normalizeConversationId(payload.conversationId));
        return;
      }
      if (type === "chat.send") {
        await runChat(client, payload);
        return;
      }

      sendJson(ws, {
        type: "socket.error",
        ok: false,
        error: `unknown event type: ${type || "(empty)"}`,
      });
    });

    ws.on("close", () => {
      clients.delete(client);
    });
  };

  return { bindConnection };
};

const attachRealtimeWebSocketServer = (server) => {
  const runtime = createRealtimeRuntime();
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", runtime.bindConnection);

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return wss;
};

export { attachRealtimeWebSocketServer };
