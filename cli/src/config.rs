use std::env;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::args::Args;

const DEFAULT_SYSTEM_PROMPT: &str = "你是一个运行在本机命令行中的 AI Agent。你可以正常回答问题；需要查看文件、执行命令或完成开发工作时，使用 shell 工具。只在有帮助时调用工具，完成后给出清晰、简洁的最终回答。";

#[derive(Debug, Clone)]
pub struct Config {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
    pub db_path: PathBuf,
    pub cwd: PathBuf,
    pub resume: Option<String>,
    pub system_prompt: String,
    pub compact_prompt: String,
    pub compress_threshold: u64,
    pub max_rounds: usize,
    pub tool_result_max_chars: usize,
}

impl Config {
    pub fn from_args(args: Args) -> Result<Self> {
        let cwd = args
            .cwd
            .unwrap_or(env::current_dir().context("无法读取当前工作目录")?)
            .canonicalize()
            .context("工作目录不存在")?;
        let db_path = args
            .db
            .or_else(|| env::var_os("AGENT_DB_PATH").map(PathBuf::from))
            .unwrap_or_else(default_db_path);

        Ok(Self {
            api_url: args
                .api_url
                .or_else(|| env::var("LLM_API_URL").ok())
                .unwrap_or_else(|| "https://api.openai.com/v1/chat/completions".into()),
            api_key: args
                .api_key
                .or_else(|| env::var("LLM_API_KEY").ok())
                .unwrap_or_default(),
            model: args
                .model
                .or_else(|| env::var("LLM_MODEL").ok())
                .unwrap_or_else(|| "gpt-4.1-mini".into()),
            db_path,
            cwd,
            resume: args.resume,
            system_prompt: env::var("AGENT_SYSTEM_PROMPT")
                .unwrap_or_else(|_| DEFAULT_SYSTEM_PROMPT.into()),
            compact_prompt: env::var("AGENT_COMPACT_PROMPT")
                .unwrap_or_else(|_| default_compact_prompt()),
            compress_threshold: args
                .compress_threshold
                .or_else(|| env_u64("AGENT_COMPRESS_THRESHOLD"))
                .unwrap_or(64_000),
            max_rounds: args
                .max_rounds
                .or_else(|| env_usize("AGENT_MAX_ROUNDS"))
                .unwrap_or(100)
                .max(1),
            tool_result_max_chars: env_usize("AGENT_TOOL_RESULT_MAX_CHARS")
                .unwrap_or(12_000)
                .max(1_000),
        })
    }
}

pub fn load_dotenv() {
    if env::current_dir()
        .ok()
        .as_deref()
        .is_some_and(load_from_ancestors)
    {
        return;
    }
    if let Ok(executable) = env::current_exe() {
        if let Some(directory) = executable.parent() {
            load_from_ancestors(directory);
        }
    }
}

fn load_from_ancestors(start: &Path) -> bool {
    let mut cursor = Some(start.to_path_buf());
    while let Some(dir) = cursor {
        let candidate = dir.join(".env");
        if candidate.is_file() {
            let _ = dotenvy::from_path(candidate);
            return true;
        }
        cursor = dir.parent().map(Path::to_path_buf);
    }
    false
}

fn env_u64(key: &str) -> Option<u64> {
    env::var(key).ok()?.parse().ok()
}

fn env_usize(key: &str) -> Option<usize> {
    env::var(key).ok()?.parse().ok()
}

fn default_db_path() -> PathBuf {
    if let Some(home) = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")) {
        return PathBuf::from(home).join(".agent-cli").join("agent.db");
    }
    PathBuf::from("data").join("agent.db")
}

fn default_compact_prompt() -> String {
    "你负责压缩一段聊天上下文，供后续大模型继续对话时使用。\n\n请保留：\n- 用户明确提出的目标、偏好、限制和已经确认的决策\n- 助手已经完成的关键改动、文件路径、接口协议和运行结果\n- 工具调用中影响后续工作的事实\n- 仍未解决的问题和下一步\n\n请删除寒暄、重复内容、无效中间过程。输出中文摘要，结构清晰，避免编造。".into()
}
