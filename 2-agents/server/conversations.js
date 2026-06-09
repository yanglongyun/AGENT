// @ts-nocheck
// 对话(= agent)CRUD。
import { getDb } from "./db.js";

const rowToConversation = (row) => row
  ? {
      id: row.id,
      title: row.title,
      description: row.description || "",
      system: row.system || "",
      created_at: row.created_at,
    }
  : null;

const listConversations = () => {
  const rows = getDb()
    .prepare("SELECT id, title, description, system, created_at FROM conversations ORDER BY id ASC")
    .all();
  return rows.map(rowToConversation);
};

const getConversation = (id) => {
  const row = getDb()
    .prepare("SELECT id, title, description, system, created_at FROM conversations WHERE id = ?")
    .get(Number(id));
  return rowToConversation(row);
};

const createConversation = ({ title, description = "", system = "" } = {}) => {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("title is required");
  const result = getDb()
    .prepare("INSERT INTO conversations (title, description, system) VALUES (?, ?, ?)")
    .run(cleanTitle, String(description || ""), String(system || ""));
  return getConversation(Number(result.lastInsertRowid));
};

const updateConversation = (id, { title, description, system } = {}) => {
  const current = getConversation(id);
  if (!current) throw new Error("conversation not found");
  const next = {
    title: title == null ? current.title : String(title).trim() || current.title,
    description: description == null ? current.description : String(description),
    system: system == null ? current.system : String(system),
  };
  getDb()
    .prepare("UPDATE conversations SET title = ?, description = ?, system = ? WHERE id = ?")
    .run(next.title, next.description, next.system, Number(id));
  return getConversation(id);
};

const deleteConversation = (id) => {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(Number(id));
    db.prepare("DELETE FROM conversations WHERE id = ?").run(Number(id));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
};
