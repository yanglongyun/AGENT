import { SERVER_URL } from "../runtime.js";
import { request } from "./http.js";
import { readSseResponse } from "./sse.js";

const titleFromPrompt = (prompt) => String(prompt || "").trim().slice(0, 20) || "untitled";

const createConversation = async (title) => {
  const res = await request("/api/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return res.conversation?.id;
};

const runChatTurn = async (conversationId, prompt) => {
  const res = await fetch(`${SERVER_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, prompt }),
  });
  await readSseResponse(res);
};

export { createConversation, runChatTurn, titleFromPrompt };
