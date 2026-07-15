use std::io::{self, Write};
use std::path::Path;

use anyhow::Result;

use crate::agent::Agent;

pub async fn run(mut agent: Agent) -> Result<()> {
    println!("Agent CLI");
    println!("chat: {}", agent.chat_id);
    println!("model: {}", agent.config.model);
    println!("cwd: {}", agent.config.cwd.display());
    println!("输入 /help 查看命令，Ctrl+C 可中断当前运行。\n");

    loop {
        print!("You> ");
        io::stdout().flush()?;
        let mut input = String::new();
        let read = io::stdin().read_line(&mut input)?;
        if read == 0 {
            println!();
            return Ok(());
        }
        let input = input.trim();
        if input.is_empty() {
            continue;
        }
        if input.starts_with('/') {
            if handle_command(&mut agent, input).await? {
                return Ok(());
            }
            continue;
        }

        tokio::select! {
            result = agent.send(input) => {
                if let Err(error) = result {
                    eprintln!("Error> {error:#}");
                }
            }
            _ = tokio::signal::ctrl_c() => {
                println!("\n已中断当前运行。");
            }
        }
        println!();
    }
}

async fn handle_command(agent: &mut Agent, input: &str) -> Result<bool> {
    let (command, argument) = input
        .split_once(char::is_whitespace)
        .map(|(command, argument)| (command, argument.trim()))
        .unwrap_or((input, ""));
    match command {
        "/exit" | "/quit" => return Ok(true),
        "/help" => print_help(),
        "/new" => {
            agent.new_chat(if argument.is_empty() {
                "New chat"
            } else {
                argument
            })?;
            println!("已创建会话 {}", agent.chat_id);
        }
        "/chats" => {
            for chat in agent.database.list_chats(50)? {
                let current = if chat.id == agent.chat_id { "*" } else { " " };
                println!(
                    "{current} {}  {}  {}",
                    chat.id,
                    chat.created_at,
                    chat.title.unwrap_or_default()
                );
            }
        }
        "/resume" => {
            if argument.is_empty() {
                println!("用法：/resume <chat-id>");
            } else {
                agent.resume_chat(argument)?;
                println!("已恢复会话 {}", agent.chat_id);
            }
        }
        "/compact" => {
            let result = tokio::select! {
                result = agent.compact_now() => Some(result),
                _ = tokio::signal::ctrl_c() => None,
            };
            match result {
                Some(Ok(Some(_))) => {}
                Some(Ok(None)) => println!("当前没有足够的消息可压缩。"),
                Some(Err(error)) => eprintln!("Error> {error:#}"),
                None => println!("\n已中断压缩。"),
            }
        }
        "/context" => {
            let status = agent.context_status()?;
            println!("chat: {}", agent.chat_id);
            println!("messages: {}", status.messages);
            println!(
                "latest total_tokens: {}",
                status
                    .total_tokens
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "-".into())
            );
            println!("compress threshold: {}", agent.config.compress_threshold);
            if let Some(compaction) = status.compaction {
                println!(
                    "latest compaction: #{} messages {}..{} ({} tokens)",
                    compaction.id,
                    compaction.start_message_id,
                    compaction.end_message_id,
                    compaction.tokens
                );
            } else {
                println!("latest compaction: -");
            }
        }
        "/model" => {
            if argument.is_empty() {
                println!("model: {}", agent.config.model);
            } else {
                agent.config.model = argument.into();
                println!("model: {}", agent.config.model);
            }
        }
        "/cd" => {
            if argument.is_empty() {
                println!("cwd: {}", agent.config.cwd.display());
            } else {
                let path = agent.set_cwd(Path::new(argument))?;
                println!("cwd: {}", path.display());
            }
        }
        _ => println!("未知命令 {command}，输入 /help 查看命令。"),
    }
    Ok(false)
}

fn print_help() {
    println!("/new [title]       新建会话");
    println!("/chats             查看会话");
    println!("/resume <id>       恢复会话");
    println!("/compact           手动压缩上下文");
    println!("/context           查看消息和 token 状态");
    println!("/model [name]      查看或切换模型");
    println!("/cd [path]         查看或切换工作目录");
    println!("/exit              退出");
}
