// @ts-nocheck
// 单对话消息仓库:存的就是模型消息对象(role/content/tool_calls/...)整块 JSON。
import { getDb } from "./db.js";

const appendMessage = (message) => {
  const result = getDb()
    .prepare("INSERT INTO messages (message) VALUES (?)")
    .run(JSON.stringify(message));
  return Number(result.lastInsertRowid);
};

const saveMessages = (messages = []) => {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO messages (message) VALUES (?)");
  db.exec("BEGIN");
  try {
    for (const message of messages) stmt.run(JSON.stringify(message));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

const listMessages = () => {
  const rows = getDb()
    .prepare("SELECT id, message FROM messages ORDER BY id ASC")
    .all();
  return rows.map((row) => ({ id: row.id, message: JSON.parse(row.message) }));
};

const clearMessages = () => {
  getDb().exec("DELETE FROM messages");
};

export { appendMessage, saveMessages, listMessages, clearMessages };
