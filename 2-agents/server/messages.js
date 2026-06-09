// @ts-nocheck
// 消息按 conversation_id 路由。整条 message 对象(role/content/tool_calls/...)整块存。
import { getDb } from "./db.js";

const appendMessage = (conversationId, message) => {
  const result = getDb()
    .prepare("INSERT INTO messages (conversation_id, message) VALUES (?, ?)")
    .run(Number(conversationId), JSON.stringify(message));
  return Number(result.lastInsertRowid);
};

const saveMessages = (conversationId, messages = []) => {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO messages (conversation_id, message) VALUES (?, ?)");
  const cid = Number(conversationId);
  db.exec("BEGIN");
  try {
    for (const message of messages) stmt.run(cid, JSON.stringify(message));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const listMessages = (conversationId) => {
  const rows = getDb()
    .prepare("SELECT id, message FROM messages WHERE conversation_id = ? ORDER BY id ASC")
    .all(Number(conversationId));
  return rows.map((row) => ({ id: row.id, message: JSON.parse(row.message) }));
};

const clearMessages = (conversationId) => {
  getDb()
    .prepare("DELETE FROM messages WHERE conversation_id = ?")
    .run(Number(conversationId));
};

export { appendMessage, saveMessages, listMessages, clearMessages };
