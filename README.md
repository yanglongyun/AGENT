# AGENT 🤖

**一个本地运行的 Agent 内核。**

🧠 大脑 + 🔌 工具 + 💾 SQLite,跑在你自己机器上,所有交互收口到 HTTP。CLI 是默认入口。

不是 GUI app,也不是平台。就是一个**干净的本地内核**,能调模型、能调工具、能跑任务、能持久化 —— 上层想加什么自己接。

---

## 🧱 六块结构

```
llm/        模型管线         provider、输入整理、请求构建、输出解析
ai/         无状态执行器     agent loop、tool call、shell 工具
server/     有状态编排器     HTTP API、prompt、消息持久化、任务管理
cli/        终端入口         REPL、单次问答、设置管理
gui/        图形入口         本地 Vue 控制台
database/   SQLite 数据目录   一个文件搞定所有持久化
```

明确的边界:

- `llm` 只处理模型调用协议差异,不放业务逻辑
- `ai` 不动数据库,只接收已经组装好的消息列表
- `server` 负责查历史、拼 prompt、调 ai、把新消息落库
- `cli` 只发本轮输入,不拼上下文
- 一切对外接口走 HTTP `/api/*`

## ✨ 能做什么

- 💬 **多轮对话** —— `POST /api/chat` 单接口 SSE,一条流走完 `delta / tool_call / tool_result / done`
- 🛠 **工具调用** —— 对模型只暴露一个 `shell` 工具,tool call → tool result 自动闭环
- 📋 **任务系统** —— `POST /api/tasks` 后台执行,Agent 可以自己 spawn 子任务,子会话挂在父会话上
- 💾 **整条消息存储** —— `messages.message` 存完整 message JSON,不被某个 agent 协议反向绑死 schema
- 🗂 **多会话隔离** —— 每个 conversation 独立,`contextTurns` 决定上下文窗口
- 🧠 **跨会话记忆** —— 独立 `/api/memories`,长期沉淀
- ⚙️ **配置层** —— 模型、system prompt、上下文长度统一走 `/api/settings`

## 🛠 技术栈

Node.js · node:sqlite · Vue · Vite

六层顶级目录结构,默认监听 `9500`,SQLite 单文件持久化在 `./database/`。

## 🚀 快速上手

```bash
git clone https://github.com/valueriver/AGENT
cd AGENT && npm install
```

三条启动命令挑一个:

```bash
npm start      # 只起 server
npm run cli    # server + 进入 CLI repl
npm run gui    # server + 起 GUI(可选)
```

或者直接一键:

```bash
./install.sh
```

跑完之后全局可用:

```bash
agent                    # REPL
agent chat "你好"         # 单次问答
agent settings get       # 查看当前设置
```

## 🐳 Docker

```bash
docker compose up --build
```

容器:监听 `9500` · SQLite 卷挂在 `./database`。

健康检查:

```bash
curl http://127.0.0.1:9500/health
```

## 📡 HTTP API

| 资源 | 方法 + 路径 |
|---|---|
| 心跳 | `GET /health` |
| 对话(SSE) | `POST /api/chat` |
| 会话 | `GET / POST / DELETE /api/chats` |
| 消息 | `GET /api/messages?conversationId=N` |
| 任务 | `GET / POST / PATCH /api/tasks` |
| 记忆 | `GET / POST / PATCH / DELETE /api/memories` |
| 设置 | `GET / POST /api/settings` |
| 模型供应方 | `GET /api/llm/providers` |

资源名统一 `/api/*`,server 暴露应用接口,不暴露内部实现。

## 🧭 数据流(一次 CLI 对话)

```
1. CLI 发送本轮输入
2. server 按 conversationId 查历史
3. server 按 contextTurns 截上下文
4. server 读 settings(模型 / 用户 system prompt)
5. server 拼运行时上下文,组完整 messages
6. server 调 ai
7. ai 通过 llm 跟模型走 tool_call ↔ tool_result 循环到 final answer
8. server 把新消息落库
9. server 通过 SSE 持续 push 给 CLI
```

边界很清楚:**CLI 发输入 → server 拼上下文 → ai 跑消息 → llm 调模型**。

## 🎯 适合 / 不适合

适合:

- 本地 agent 内核实验
- CLI 优先的 agent
- 任务型 / 需要 spawn 子任务的服务
- 需要 SQLite 持久化的轻量应用层

不适合:

- 想把业务逻辑塞进 agent 核心
- 大流量、需要分布式的场景

## 🗺 后续方向

- 任务、记忆、统计的应用层抽象继续收紧
- GUI 体验继续增强

## 📜 License

[MIT](./LICENSE) —— 拿去改、拿去用。
