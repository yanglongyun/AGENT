// @ts-nocheck
// 最小 WebSocket:只处理 ping / chat.message / chat.abort。单对话,无 chatId。
import WebSocket, { WebSocketServer } from "ws";
import { sendMessage, abort } from "./chat.js";

const WS_PATH = "/ws";

const attachWebSocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    const emit = (payload) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };
    emit({ type: "socket.connected" });

    ws.on("message", async (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw || "{}"));
      } catch (error) {
        emit({ type: "socket.error", content: error.message });
        return;
      }
      const type = String(payload.type || "").trim();
      if (type === "ping") {
        emit({ type: "pong" });
      } else if (type === "chat.message") {
        await sendMessage(payload.prompt, emit);
      } else if (type === "chat.abort") {
        abort();
      } else {
        emit({ type: "socket.error", content: `unknown event type: ${type || "(empty)"}` });
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  return wss;
};

export { attachWebSocketServer };
