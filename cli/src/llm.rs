use anyhow::{Context, Result, bail};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::model::{FunctionCall, Message, ToolCall, Usage};

pub struct LlmClient {
    client: Client,
}

pub struct LlmResult {
    pub message: Message,
    pub usage: Usage,
}

#[derive(Default)]
struct Accumulator {
    role: String,
    content: String,
    tool_calls: Vec<PartialToolCall>,
}

#[derive(Default, Clone)]
struct PartialToolCall {
    id: String,
    kind: String,
    name: String,
    arguments: String,
}

#[derive(Debug, Deserialize)]
struct StreamFrame {
    #[serde(default)]
    choices: Vec<Choice>,
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    delta: Delta,
}

#[derive(Debug, Default, Deserialize)]
struct Delta {
    role: Option<String>,
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    index: usize,
    id: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

impl LlmClient {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: Client::builder().build()?,
        })
    }

    pub async fn stream<F>(
        &self,
        api_url: &str,
        api_key: &str,
        model: &str,
        messages: &[Message],
        with_tools: bool,
        mut on_text: F,
    ) -> Result<LlmResult>
    where
        F: FnMut(&str),
    {
        if api_key.trim().is_empty() {
            bail!("缺少 LLM_API_KEY，请通过环境变量、.env 或 --api-key 配置")
        }

        let mut payload = json!({
            "model": model,
            "messages": messages,
            "stream": true,
            "stream_options": { "include_usage": true }
        });
        if with_tools {
            payload["tools"] = Value::Array(vec![shell_schema()]);
        }

        let response = self
            .client
            .post(api_url)
            .bearer_auth(api_key)
            .json(&payload)
            .send()
            .await
            .context("模型请求失败")?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            bail!("LLM {status}: {body}")
        }

        let mut stream = response.bytes_stream();
        let mut buffer = Vec::<u8>::new();
        let mut accumulator = Accumulator::default();
        let mut usage = None;

        while let Some(chunk) = stream.next().await {
            buffer.extend_from_slice(&chunk.context("读取模型流失败")?);
            while let Some((position, separator_len)) = find_event_separator(&buffer) {
                let event = buffer[..position].to_vec();
                buffer.drain(..position + separator_len);
                if let Some(frame) = parse_event(&event)? {
                    usage = frame.usage.or(usage);
                    if let Some(choice) = frame.choices.into_iter().next() {
                        accumulate(choice.delta, &mut accumulator, &mut on_text);
                    }
                }
            }
        }

        if !buffer.is_empty() {
            if let Some(frame) = parse_event(&buffer)? {
                usage = frame.usage.or(usage);
                if let Some(choice) = frame.choices.into_iter().next() {
                    accumulate(choice.delta, &mut accumulator, &mut on_text);
                }
            }
        }

        let usage = usage.context(
            "模型流没有返回 usage.total_tokens；接口需要支持 stream_options.include_usage",
        )?;
        let tool_calls = accumulator
            .tool_calls
            .into_iter()
            .map(|item| ToolCall {
                id: item.id,
                kind: if item.kind.is_empty() {
                    "function".into()
                } else {
                    item.kind
                },
                function: FunctionCall {
                    name: item.name,
                    arguments: item.arguments,
                },
            })
            .collect::<Vec<_>>();
        let has_tools = !tool_calls.is_empty();
        Ok(LlmResult {
            message: Message {
                role: if accumulator.role.is_empty() {
                    "assistant".into()
                } else {
                    accumulator.role
                },
                content: if has_tools && accumulator.content.is_empty() {
                    None
                } else {
                    Some(accumulator.content)
                },
                tool_calls: has_tools.then_some(tool_calls),
                tool_call_id: None,
                name: None,
                extra: Default::default(),
            },
            usage,
        })
    }
}

fn accumulate<F>(delta: Delta, state: &mut Accumulator, on_text: &mut F)
where
    F: FnMut(&str),
{
    if let Some(role) = delta.role {
        state.role = role;
    }
    if let Some(content) = delta.content {
        on_text(&content);
        state.content.push_str(&content);
    }
    for delta in delta.tool_calls.unwrap_or_default() {
        while state.tool_calls.len() <= delta.index {
            state.tool_calls.push(PartialToolCall::default());
        }
        let target = &mut state.tool_calls[delta.index];
        if let Some(id) = delta.id {
            target.id.push_str(&id);
        }
        if let Some(kind) = delta.kind {
            target.kind.push_str(&kind);
        }
        if let Some(function) = delta.function {
            if let Some(name) = function.name {
                target.name.push_str(&name);
            }
            if let Some(arguments) = function.arguments {
                target.arguments.push_str(&arguments);
            }
        }
    }
}

fn parse_event(event: &[u8]) -> Result<Option<StreamFrame>> {
    let text = std::str::from_utf8(event).context("SSE 事件不是 UTF-8")?;
    let data = text
        .lines()
        .filter_map(|line| line.trim().strip_prefix("data:"))
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("\n");
    if data.is_empty() || data == "[DONE]" {
        return Ok(None);
    }
    serde_json::from_str(&data)
        .with_context(|| format!("无法解析 SSE 数据: {data}"))
        .map(Some)
}

fn find_event_separator(buffer: &[u8]) -> Option<(usize, usize)> {
    for index in 0..buffer.len() {
        if buffer.get(index..index + 2) == Some(b"\n\n") {
            return Some((index, 2));
        }
        if buffer.get(index..index + 4) == Some(b"\r\n\r\n") {
            return Some((index, 4));
        }
    }
    None
}

fn shell_schema() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "shell",
            "description": "执行 shell 命令，可以运行任意 shell 命令并返回输出结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "要执行的 shell 命令。"
                    },
                    "summary": {
                        "type": "string",
                        "description": "本次工具调用的一句话摘要，面向用户展示。"
                    },
                    "timeout": {
                        "type": "number",
                        "description": "超时时间（秒），默认 30，范围 1 到 300。"
                    },
                    "cwd": {
                        "type": "string",
                        "description": "可选工作目录，默认使用当前 Agent 工作目录。"
                    }
                },
                "required": ["command", "summary"]
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_both_sse_separators() {
        assert_eq!(find_event_separator(b"a\n\nb"), Some((1, 2)));
        assert_eq!(find_event_separator(b"a\r\n\r\nb"), Some((1, 4)));
    }

    #[test]
    fn merges_tool_call_deltas() {
        let mut state = Accumulator::default();
        let mut text = String::new();
        accumulate(
            Delta {
                tool_calls: Some(vec![ToolCallDelta {
                    index: 0,
                    id: Some("call_1".into()),
                    kind: Some("function".into()),
                    function: Some(FunctionDelta {
                        name: Some("shell".into()),
                        arguments: Some("{\"command\":".into()),
                    }),
                }]),
                ..Default::default()
            },
            &mut state,
            &mut |chunk| text.push_str(chunk),
        );
        accumulate(
            Delta {
                tool_calls: Some(vec![ToolCallDelta {
                    index: 0,
                    id: None,
                    kind: None,
                    function: Some(FunctionDelta {
                        name: None,
                        arguments: Some("\"pwd\"}".into()),
                    }),
                }]),
                ..Default::default()
            },
            &mut state,
            &mut |chunk| text.push_str(chunk),
        );
        assert_eq!(state.tool_calls[0].name, "shell");
        assert_eq!(state.tool_calls[0].arguments, "{\"command\":\"pwd\"}");
    }
}
