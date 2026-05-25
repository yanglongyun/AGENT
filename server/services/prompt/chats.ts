// @ts-nocheck
import { listMemosBefore } from "../../repository/memos/index.js";
import { getChat } from "../../repository/chats/index.js";

const chats = (conversationId, contextMessages = []) => {
  const chat = getChat(conversationId);
  if (!chat) return "";

  const boundaryId = contextMessages
    .map((message) => message._id)
    .filter((id) => Number.isFinite(id))
    .reduce((min, id) => (min === null || id < min ? id : min), null);
  const outOfContextMemos = boundaryId
    ? listMemosBefore(conversationId, boundaryId, 30)
    : [];

  const lines = ["", "## 当前会话", `<conversation>`];
  lines.push(`title: ${chat.title || ""}`);
  lines.push(`summary: ${chat.summary || ""}`);
  if (outOfContextMemos.length) {
    lines.push("");
    lines.push("memos (out of context window, newest-first, up to 30):");
    for (const memo of outOfContextMemos) {
      lines.push(`- [#${memo.id}] ${memo.content}`);
    }
  }
  lines.push("</conversation>");
  return lines.join("\n");
};

export { chats };
