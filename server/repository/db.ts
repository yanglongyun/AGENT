// @ts-nocheck
import fs from "fs";
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../database/agent.db");
const DB_DIR = path.dirname(DB_PATH);

let db;

// 幂等迁移:为已存在的库补列 / 清理已废弃的表。
const migrate = (database) => {
  const addColumn = (table, column, type) => {
    try {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch {
      // 列已存在,忽略
    }
  };
  addColumn("tasks", "notify_conversation_id", "TEXT");
  addColumn("tasks", "notify_prompt", "TEXT");
  // 监视器已折叠进任务,丢弃遗留表
  try {
    database.exec("DROP TABLE IF EXISTS monitors");
  } catch {
    // ignore
  }
};

const initDb = () => {
  if (db) return db;

  fs.mkdirSync(DB_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      message TEXT NOT NULL,
      memo TEXT,
      usage TEXT,
      meta TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prompt TEXT,
      response TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      notify_conversation_id TEXT,
      notify_prompt TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      creator TEXT NOT NULL DEFAULT 'user',
      visibility TEXT NOT NULL DEFAULT 'hidden',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS objectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      heartbeat_seconds INTEGER NOT NULL DEFAULT 300,
      beats INTEGER NOT NULL DEFAULT 0,
      last_beat_at DATETIME,
      last_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_chats_conversation ON chats(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_memo ON messages(conversation_id) WHERE memo IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_memos_conversation ON memos(conversation_id, id);
    CREATE INDEX IF NOT EXISTS idx_memos_message ON memos(message_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON tasks(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_memories_enabled_visibility ON memories(enabled, visibility);
    CREATE INDEX IF NOT EXISTS idx_objectives_status ON objectives(status);
    CREATE INDEX IF NOT EXISTS idx_objectives_conversation ON objectives(conversation_id);
  `);

  migrate(db);

  return db;
};

const getDb = () => initDb();

export { getDb, initDb };
