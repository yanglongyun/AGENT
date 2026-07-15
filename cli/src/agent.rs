use std::io::{self, Write};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde_json::json;

use crate::config::Config;
use crate::llm::LlmClient;
use crate::model::{Compaction, Message, StoredMessage};
use crate::repository::{Database, require_chat};
use crate::tools;

pub struct Agent {
    pub config: Config,
    pub database: Database,
    pub chat_id: String,
    llm: LlmClient,
}

pub struct ContextStatus {
    pub messages: u64,
    pub total_tokens: Option<u64>,
    pub compaction: Option<Compaction>,
}

impl Agent {
    pub fn new(config: Config, database: Database) -> Result<Self> {
        let chat = if let Some(id) = config.resume.as_deref() {
            require_chat(&database, id)?
        } else {
            database.create_chat("New chat")?
        };
        Ok(Self {
            config,
            database,
            chat_id: chat.id,
            llm: LlmClient::new()?,
        })
    }

    pub async fn send(&mut self, input: &str) -> Result<()> {
        if let Some(usage) = self.database.latest_usage(&self.chat_id)? {
            self.compact_if_needed(false, usage.total_tokens).await?;
        }

        if self.database.message_count(&self.chat_id)? == 0 {
            self.database.update_chat_title(&self.chat_id, input)?;
        }
        self.database.append_message(
            &self.chat_id,
            &Message::text("user", input),
            Some(&json!({ "kind": "message", "source": "user" })),
            None,
        )?;

        for round in 1..=self.config.max_rounds {
            let messages = self.context_messages()?;
            print!("Agent> ");
            io::stdout().flush()?;
            let result = self
                .llm
                .stream(
                    &self.config.api_url,
                    &self.config.api_key,
                    &self.config.model,
                    &messages,
                    true,
                    |chunk| {
                        print!("{chunk}");
                        let _ = io::stdout().flush();
                    },
                )
                .await?;
            println!();
            self.database.append_message(
                &self.chat_id,
                &result.message,
                Some(&json!({ "source": "ai" })),
                Some(&result.usage),
            )?;

            let Some(tool_calls) = result.message.tool_calls.clone() else {
                return Ok(());
            };
            if tool_calls.is_empty() {
                return Ok(());
            }

            for call in tool_calls {
                let output =
                    tools::execute(&call, &self.config.cwd, self.config.tool_result_max_chars)
                        .await;
                println!("Tool> {} — {}", output.name, output.summary);
                println!("{}", output.content);
                let message = Message::tool(call.id, output.name, output.content);
                self.database.append_message(
                    &self.chat_id,
                    &message,
                    Some(&json!({ "source": "tool" })),
                    None,
                )?;
            }

            self.compact_if_needed(false, result.usage.total_tokens)
                .await?;
            if round == self.config.max_rounds {
                let text = format!("已达到工具执行轮次上限 {}。", self.config.max_rounds);
                self.database.append_message(
                    &self.chat_id,
                    &Message::text("assistant", &text),
                    Some(&json!({ "source": "ai" })),
                    None,
                )?;
                println!("Agent> {text}");
            }
        }
        Ok(())
    }

    pub async fn compact_now(&mut self) -> Result<Option<Compaction>> {
        let tokens = self
            .database
            .latest_usage(&self.chat_id)?
            .map(|usage| usage.total_tokens)
            .unwrap_or(0);
        self.compact_if_needed(true, tokens).await
    }

    pub fn new_chat(&mut self, title: &str) -> Result<()> {
        self.chat_id = self.database.create_chat(title)?.id;
        Ok(())
    }

    pub fn resume_chat(&mut self, chat_id: &str) -> Result<()> {
        self.chat_id = require_chat(&self.database, chat_id)?.id;
        Ok(())
    }

    pub fn set_cwd(&mut self, path: &Path) -> Result<PathBuf> {
        let path = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.config.cwd.join(path)
        };
        let path = path.canonicalize().context("目录不存在")?;
        if !path.is_dir() {
            bail!("{} 不是目录", path.display())
        }
        self.config.cwd = path.clone();
        Ok(path)
    }

    pub fn context_status(&self) -> Result<ContextStatus> {
        Ok(ContextStatus {
            messages: self.database.message_count(&self.chat_id)?,
            total_tokens: self
                .database
                .latest_usage(&self.chat_id)?
                .map(|usage| usage.total_tokens),
            compaction: self.database.latest_compaction(&self.chat_id)?,
        })
    }

    fn context_messages(&self) -> Result<Vec<Message>> {
        let mut messages = vec![Message::text(
            "system",
            format!(
                "{}\n\n## 运行环境\n- 工作目录：{}\n- 模型：{}\n\n## 工具\n- shell(command, summary, timeout?, cwd?)：执行本机 shell 命令。\n- shell 没有沙箱，只在确实需要时使用。",
                self.config.system_prompt,
                self.config.cwd.display(),
                self.config.model
            ),
        )];
        if let Some(compaction) = self.database.latest_compaction(&self.chat_id)? {
            messages.push(Message::text(
                "user",
                format!("以下是历史上下文压缩摘要：\n\n{}", compaction.summary),
            ));
        }
        messages.extend(
            self.database
                .list_context_messages(&self.chat_id)?
                .into_iter()
                .map(|row| row.message),
        );
        Ok(messages)
    }

    async fn compact_if_needed(
        &mut self,
        force: bool,
        total_tokens: u64,
    ) -> Result<Option<Compaction>> {
        if !force
            && (self.config.compress_threshold == 0
                || total_tokens < self.config.compress_threshold)
        {
            return Ok(None);
        }

        let latest = self.database.latest_compaction(&self.chat_id)?;
        let rows = self.database.list_uncompacted_messages(&self.chat_id)?;
        let suffix_start = keep_suffix_start(&rows);
        if suffix_start <= 2 {
            return Ok(None);
        }
        let candidates = &rows[..suffix_start];
        let start_message_id = candidates.first().map(|row| row.id).unwrap_or(0);
        let end_message_id = candidates.last().map(|row| row.id).unwrap_or(0);
        if start_message_id == 0 || end_message_id == 0 {
            return Ok(None);
        }

        println!("Compact> 正在压缩消息 #{start_message_id}..#{end_message_id}");
        let mut summary_input = String::new();
        if let Some(previous) = latest.as_ref() {
            summary_input.push_str("上一版历史摘要：\n\n");
            summary_input.push_str(&previous.summary);
            summary_input.push_str("\n\n---\n\n新增聊天消息：\n\n");
        }
        summary_input.push_str(&serialize_for_summary(candidates));
        let messages = vec![
            Message::text("system", &self.config.compact_prompt),
            Message::text("user", format!("请压缩以下聊天消息：\n\n{summary_input}")),
        ];
        let result = self
            .llm
            .stream(
                &self.config.api_url,
                &self.config.api_key,
                &self.config.model,
                &messages,
                false,
                |_| {},
            )
            .await?;
        let summary = result
            .message
            .content
            .unwrap_or_default()
            .trim()
            .to_string();
        if summary.is_empty() {
            bail!("模型返回了空压缩摘要")
        }
        let compaction = self.database.create_compaction(
            &self.chat_id,
            start_message_id,
            end_message_id,
            &summary,
            result.usage.total_tokens,
        )?;
        println!("Compact> 完成，摘要 usage {} tokens", compaction.tokens);
        Ok(Some(compaction))
    }
}

fn keep_suffix_start(rows: &[StoredMessage]) -> usize {
    let Some(last) = rows.last() else {
        return 0;
    };
    if last.message.role == "tool" {
        for (index, row) in rows.iter().enumerate().rev() {
            if row.message.role == "assistant"
                && row
                    .message
                    .tool_calls
                    .as_ref()
                    .is_some_and(|calls| !calls.is_empty())
            {
                return index;
            }
        }
    }
    rows.len().saturating_sub(1)
}

fn serialize_for_summary(rows: &[StoredMessage]) -> String {
    rows.iter()
        .map(|row| {
            let message = &row.message;
            let content = if message.role == "assistant"
                && message
                    .tool_calls
                    .as_ref()
                    .is_some_and(|calls| !calls.is_empty())
            {
                format!(
                    "{}\ntool_calls: {}",
                    message.content.as_deref().unwrap_or_default(),
                    serde_json::to_string(message.tool_calls.as_ref().unwrap()).unwrap_or_default()
                )
            } else if message.role == "tool" {
                format!(
                    "tool_call_id: {}\n{}",
                    message.tool_call_id.as_deref().unwrap_or_default(),
                    message.content.as_deref().unwrap_or_default()
                )
            } else {
                message.content.clone().unwrap_or_default()
            };
            format!("#{} {}\n{}", row.id, message.role, content)
        })
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{FunctionCall, ToolCall};

    fn row(id: i64, message: Message) -> StoredMessage {
        StoredMessage { id, message }
    }

    #[test]
    fn keeps_last_plain_message() {
        let rows = vec![
            row(1, Message::text("user", "a")),
            row(2, Message::text("assistant", "b")),
            row(3, Message::text("user", "c")),
        ];
        assert_eq!(keep_suffix_start(&rows), 2);
    }

    #[test]
    fn keeps_tool_block_together() {
        let assistant = Message {
            role: "assistant".into(),
            content: None,
            tool_calls: Some(vec![ToolCall {
                id: "call_1".into(),
                kind: "function".into(),
                function: FunctionCall {
                    name: "shell".into(),
                    arguments: "{}".into(),
                },
            }]),
            tool_call_id: None,
            name: None,
            extra: Default::default(),
        };
        let rows = vec![
            row(1, Message::text("user", "a")),
            row(2, assistant),
            row(
                3,
                Message::tool("call_1".into(), "shell".into(), "ok".into()),
            ),
        ];
        assert_eq!(keep_suffix_start(&rows), 1);
    }
}
