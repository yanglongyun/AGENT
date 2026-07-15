# Agent CLI

纯命令行本地 Agent。支持 OpenAI 兼容流式对话、Shell 工具循环、SQLite 会话和上下文压缩。

## 运行

需要 Rust 1.85 或更高版本。

```bash
cd cli
export LLM_API_KEY=...
cargo run --release
```

也可以读取当前目录或父目录中的 `.env`：

```dotenv
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_API_KEY=...
LLM_MODEL=gpt-4.1-mini
```

默认数据库位于 `~/.agent-cli/agent.db`。

## 参数

```text
--api-url <URL>
--api-key <KEY>
--model <MODEL>
--db <PATH>
--cwd <PATH>
--resume <CHAT_ID>
--compress-threshold <TOKENS>
--max-rounds <COUNT>
```

## 交互命令

```text
/new [title]
/chats
/resume <id>
/compact
/context
/model [name]
/cd [path]
/exit
```

`shell` 工具直接在本机执行命令，没有沙箱。
