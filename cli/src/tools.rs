use std::env;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use tokio::process::Command;
use tokio::time::timeout;

use crate::model::ToolCall;

#[derive(Debug, Deserialize)]
struct ShellArgs {
    command: String,
    summary: String,
    timeout: Option<u64>,
    cwd: Option<String>,
}

pub struct ToolOutput {
    pub name: String,
    pub summary: String,
    pub content: String,
}

pub async fn execute(call: &ToolCall, default_cwd: &Path, max_chars: usize) -> ToolOutput {
    let name = call.function.name.clone();
    match execute_inner(call, default_cwd).await {
        Ok((summary, content)) => ToolOutput {
            name,
            summary,
            content: truncate(content, max_chars),
        },
        Err(error) => ToolOutput {
            name,
            summary: "工具执行失败".into(),
            content: format!("tool error: {error:#}"),
        },
    }
}

async fn execute_inner(call: &ToolCall, default_cwd: &Path) -> Result<(String, String)> {
    if call.function.name != "shell" {
        bail!("未知工具: {}", call.function.name)
    }
    let args: ShellArgs =
        serde_json::from_str(&call.function.arguments).context("shell arguments 不是有效 JSON")?;
    if args.command.trim().is_empty() {
        bail!("shell command 不能为空")
    }
    let working_dir = resolve_cwd(args.cwd.as_deref(), default_cwd);
    let seconds = args.timeout.unwrap_or(30).clamp(1, 300);

    let mut command = shell_command(&args.command);
    command
        .current_dir(&working_dir)
        .kill_on_drop(true)
        .envs(env::vars());
    let output = match timeout(Duration::from_secs(seconds), command.output()).await {
        Ok(result) => result.context("无法启动 shell")?,
        Err(_) => {
            return Ok((
                args.summary,
                format!(
                    "cwd: {}\nexit: timeout\ntimedOut: true",
                    working_dir.display()
                ),
            ));
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut lines = vec![
        format!("cwd: {}", working_dir.display()),
        format!(
            "exit: {}",
            output
                .status
                .code()
                .map_or_else(|| "signal".into(), |v| v.to_string())
        ),
    ];
    if !stdout.trim_end().is_empty() {
        lines.push(format!("\nstdout:\n{}", stdout.trim_end()));
    }
    if !stderr.trim_end().is_empty() {
        lines.push(format!("\nstderr:\n{}", stderr.trim_end()));
    }
    Ok((args.summary, lines.join("\n")))
}

#[cfg(unix)]
fn shell_command(script: &str) -> Command {
    let mut command = Command::new("sh");
    command.arg("-lc").arg(script);
    command
}

#[cfg(windows)]
fn shell_command(script: &str) -> Command {
    let mut command = Command::new("cmd");
    command.arg("/C").arg(script);
    command
}

fn resolve_cwd(value: Option<&str>, default_cwd: &Path) -> PathBuf {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return default_cwd.to_path_buf();
    };
    if value == "~" {
        return home_dir().unwrap_or_else(|| default_cwd.to_path_buf());
    }
    if let Some(suffix) = value.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(suffix);
        }
    }
    let path = PathBuf::from(value);
    if path.is_absolute() {
        path
    } else {
        default_cwd.join(path)
    }
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn truncate(value: String, max_chars: usize) -> String {
    let length = value.chars().count();
    if length <= max_chars {
        return value;
    }
    let tail = max_chars / 4;
    let head = max_chars.saturating_sub(tail);
    let start: String = value.chars().take(head).collect();
    let end: String = value.chars().skip(length - tail).collect();
    format!("{start}\n\n... tool result truncated ({length} chars) ...\n\n{end}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_unicode_safely() {
        let value = "你".repeat(20);
        let result = truncate(value, 8);
        assert!(result.starts_with("你你你你你你"));
        assert!(result.ends_with("你你"));
    }
}
