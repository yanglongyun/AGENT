// @ts-nocheck
// WebSocket 退化成事件订阅:
// - 客户端 ping/pong + chat.subscribe { conversationId } 选订哪个对话(null = 订所有)
// - 服务端把引擎广播的事件按订阅过滤后推下去
// 发消息不再走 WS,改走 HTTP POST /api/conversations/:id/messages。
import WebSocket, { WebSocketServer } from "ws";
import { subscribe } from "./chat.js";

const WS_PATH = "/ws";

const attachWebSocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    let subscribedTo = null; // null = 全订;数字 = 只订这个 conversationId

    const send = (payload) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    };

    const unsubscribe = subscribe((event) => {
      if (subscribedTo == null || event.conversationId === subscribedTo) {
        send(event);
      }
    });

    send({ type: "socket.connected" });

    ws.on("message", (raw) => {
      let payload;
      try {
        payload = JSON.parse(String(raw || "{}"));
      } catch (error) {
        send({ type: "socket.error", content: error.message });
        return;
      }
      const type = String(payload.type || "").trim();
      if (type === "ping") {
        send({ type: "pong" });
      } else if (type === "chat.subscribe") {
        const cid = payload.conversationId;
        subscribedTo = cid == null ? null : Number(cid);
        send({ type: "chat.subscribed", conversationId: subscribedTo });
      } else {
        send({ type: "socket.error", content: `unknown event type: ${type || "(empty)"}` });
      }
    });

    ws.on("close", () => {
      unsubscribe();
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
