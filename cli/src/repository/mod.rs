use std::fs;
use std::path::Path;

use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::model::{Chat, Compaction, Message, StoredMessage, Usage};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message TEXT NOT NULL,
  meta TEXT,
  usage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  start_message_id INTEGER NOT NULL,
  end_message_id INTEGER NOT NULL,
  summary TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_compactions_chat ON compactions(chat_id, id);
"#;

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("无法创建数据库目录 {}", parent.display()))?;
        }
        let connection =
            Connection::open(path).with_context(|| format!("无法打开数据库 {}", path.display()))?;
        connection.execute_batch("PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;")?;
        connection.execute_batch(SCHEMA)?;
        Ok(Self { connection })
    }

    pub fn create_chat(&self, title: &str) -> Result<Chat> {
        let id = Uuid::new_v4().to_string();
        let title = normalize_title(title);
        self.connection.execute(
            "INSERT INTO chats (id, title) VALUES (?, ?)",
            params![id, title],
        )?;
        self.get_chat(&id)?.context("新会话创建失败")
    }

    pub fn get_chat(&self, id: &str) -> Result<Option<Chat>> {
        self.connection
            .query_row(
                "SELECT id, title, created_at FROM chats WHERE id = ?",
                [id],
                |row| {
                    Ok(Chat {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        created_at: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn list_chats(&self, limit: usize) -> Result<Vec<Chat>> {
        let mut statement = self.connection.prepare(
            "SELECT id, title, created_at FROM chats ORDER BY created_at DESC, rowid DESC LIMIT ?",
        )?;
        let rows = statement.query_map([limit as i64], |row| {
            Ok(Chat {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn update_chat_title(&self, chat_id: &str, title: &str) -> Result<()> {
        self.connection.execute(
            "UPDATE chats SET title = ? WHERE id = ?",
            params![normalize_title(title), chat_id],
        )?;
        Ok(())
    }

    pub fn append_message(
        &self,
        chat_id: &str,
        message: &Message,
        meta: Option<&Value>,
        usage: Option<&Usage>,
    ) -> Result<i64> {
        self.connection.execute(
            "INSERT INTO messages (chat_id, message, meta, usage) VALUES (?, ?, ?, ?)",
            params![
                chat_id,
                serde_json::to_string(message)?,
                meta.map(serde_json::to_string).transpose()?,
                usage.map(serde_json::to_string).transpose()?,
            ],
        )?;
        Ok(self.connection.last_insert_rowid())
    }

    pub fn list_context_messages(&self, chat_id: &str) -> Result<Vec<StoredMessage>> {
        let end = self
            .latest_compaction(chat_id)?
            .map(|item| item.end_message_id)
            .unwrap_or(0);
        self.list_messages_after(chat_id, end, true)
    }

    pub fn list_uncompacted_messages(&self, chat_id: &str) -> Result<Vec<StoredMessage>> {
        let end = self
            .latest_compaction(chat_id)?
            .map(|item| item.end_message_id)
            .unwrap_or(0);
        self.list_messages_after(chat_id, end, true)
    }

    fn list_messages_after(
        &self,
        chat_id: &str,
        after_id: i64,
        exclude_compaction_messages: bool,
    ) -> Result<Vec<StoredMessage>> {
        let mut statement = self.connection.prepare(
            "SELECT id, message, meta FROM messages WHERE chat_id = ? AND id > ? ORDER BY id ASC",
        )?;
        let rows = statement.query_map(params![chat_id, after_id], |row| {
            let message_text: String = row.get(1)?;
            let meta_text: Option<String> = row.get(2)?;
            Ok((row.get::<_, i64>(0)?, message_text, meta_text))
        })?;

        let mut result = Vec::new();
        for row in rows {
            let (id, message_text, meta_text) = row?;
            let meta = meta_text
                .as_deref()
                .map(serde_json::from_str)
                .transpose()
                .with_context(|| format!("消息 #{id} meta JSON 无效"))?;
            if exclude_compaction_messages && is_compaction_meta(meta.as_ref()) {
                continue;
            }
            result.push(StoredMessage {
                id,
                message: serde_json::from_str(&message_text)
                    .with_context(|| format!("消息 #{id} JSON 无效"))?,
            });
        }
        Ok(result)
    }

    pub fn latest_usage(&self, chat_id: &str) -> Result<Option<Usage>> {
        let mut statement = self.connection.prepare(
            "SELECT usage FROM messages WHERE chat_id = ? AND usage IS NOT NULL ORDER BY id DESC LIMIT 20",
        )?;
        let rows = statement.query_map([chat_id], |row| row.get::<_, String>(0))?;
        for row in rows {
            if let Ok(usage) = serde_json::from_str::<Usage>(&row?) {
                return Ok(Some(usage));
            }
        }
        Ok(None)
    }

    pub fn message_count(&self, chat_id: &str) -> Result<u64> {
        let count = self.connection.query_row(
            "SELECT COUNT(*) FROM messages WHERE chat_id = ?",
            [chat_id],
            |row| row.get::<_, u64>(0),
        )?;
        Ok(count)
    }

    pub fn latest_compaction(&self, chat_id: &str) -> Result<Option<Compaction>> {
        self.connection
            .query_row(
                "SELECT id, start_message_id, end_message_id, summary, tokens FROM compactions WHERE chat_id = ? ORDER BY id DESC LIMIT 1",
                [chat_id],
                |row| {
                    Ok(Compaction {
                        id: row.get(0)?,
                        start_message_id: row.get(1)?,
                        end_message_id: row.get(2)?,
                        summary: row.get(3)?,
                        tokens: row.get(4)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn create_compaction(
        &mut self,
        chat_id: &str,
        start_message_id: i64,
        end_message_id: i64,
        summary: &str,
        tokens: u64,
    ) -> Result<Compaction> {
        let transaction = self.connection.transaction()?;
        transaction.execute(
            "INSERT INTO compactions (chat_id, start_message_id, end_message_id, summary, tokens) VALUES (?, ?, ?, ?, ?)",
            params![chat_id, start_message_id, end_message_id, summary, tokens],
        )?;
        let id = transaction.last_insert_rowid();
        let message = Message::text("user", format!("以下是历史上下文压缩摘要：\n\n{summary}"));
        let meta = json!({
            "kind": "compaction",
            "startMessageId": start_message_id,
            "endMessageId": end_message_id,
            "tokens": tokens,
            "compaction": {
                "id": id,
                "chat_id": chat_id,
                "start_message_id": start_message_id,
                "end_message_id": end_message_id,
                "summary": summary,
                "tokens": tokens
            }
        });
        transaction.execute(
            "INSERT INTO messages (chat_id, message, meta) VALUES (?, ?, ?)",
            params![chat_id, serde_json::to_string(&message)?, meta.to_string()],
        )?;
        transaction.commit()?;
        Ok(Compaction {
            id,
            start_message_id,
            end_message_id,
            summary: summary.into(),
            tokens,
        })
    }
}

fn is_compaction_meta(meta: Option<&Value>) -> bool {
    meta.and_then(|value| value.get("kind"))
        .and_then(Value::as_str)
        == Some("compaction")
}

fn normalize_title(value: &str) -> String {
    let trimmed = value.trim();
    let title: String = trimmed.chars().take(48).collect();
    if title.is_empty() {
        "New chat".into()
    } else {
        title
    }
}

pub fn require_chat(database: &Database, chat_id: &str) -> Result<Chat> {
    if let Some(chat) = database.get_chat(chat_id)? {
        return Ok(chat);
    }
    bail!("找不到会话 {chat_id}")
}
