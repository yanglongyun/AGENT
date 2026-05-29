# AGENT 🤖

**一个本地运行的 Agent 内核。**

🧠 大脑 + 🔌 工具 + 💾 SQLite,跑在你自己机器上,接口收口到 HTTP + WebSocket。GUI 是默认入口。

不是 GUI app,也不是平台。就是一个**干净的本地内核**,能调模型、能调工具、能跑任务、能持久化 —— 上层想加什么自己接。

---

## 🧱 六块结构

```
ai/         无状态执行器     agent loop、模型请求、tool call、shell 工具
server/     有状态编排器     HTTP API、WebSocket、prompt、消息持久化、任务管理
gui/        图形入口         本地 React 控制台
database/   SQLite 数据目录   一个文件搞定所有持久化
```

明确的边界:

- `ai` 不动数据库,只接收已经组装好的消息列表,并用 `lm.ts` 直发模型
- `server` 负责查历史、拼 prompt、调 ai、把新消息落库和广播
- 数据接口走 HTTP `/api/*`,实时事件走全局 WebSocket `/api/ws`

## ✨ 能做什么

- 💬 **多轮对话** —— `WS /api/ws` 按事件类型分发,普通回复、tool call、tool result 都按整块 message 下发
- 🛠 **工具调用** —— 对模型只暴露一个 `shell` 工具,tool call → tool result 自动闭环
- 📋 **任务系统** —— `POST /api/tasks` 后台执行,Agent 可以自己 spawn 子任务,子会话挂在父会话上
- 💾 **整条消息存储** —— `messages.message` 存完整 message JSON,不被某个 agent 协议反向绑死 schema
- 🗂 **多会话隔离** —— 每个 conversation 独立,`contextTurns` 决定上下文窗口
- 🧠 **跨会话记忆** —— 独立 `/api/memories`,长期沉淀
- ⚙️ **配置层** —— 模型、system prompt、上下文长度统一走 `/api/settings`

## 🛠 技术栈

Node.js · TypeScript · node:sqlite · React · Tailwind · Vite

六层顶级目录结构,默认监听 `9500`,SQLite 单文件持久化在 `./database/`。

## 🚀 快速上手

```bash
git clone https://github.com/valueriver/AGENT
cd AGENT && npm install
```

启动:

```bash
npm start      # 只起 server
npm run gui    # server + 起 React GUI
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

## 📡 API

| 资源 | 方法 + 路径 |
|---|---|
| 心跳 | `GET /health` |
| 实时事件 | `WS /api/ws` |
| 会话 | `GET / POST / DELETE /api/chats` |
| 消息 | `GET /api/messages?conversationId=N` |
| 任务 | `GET / POST / PATCH /api/tasks` |
| 记忆 | `GET / POST / PATCH / DELETE /api/memories` |
| 设置 | `GET / POST /api/settings` |

资源名统一 `/api/*`,server 暴露应用接口,不暴露内部实现。

## 🧭 数据流(一次 GUI 对话)

```
1. GUI 通过全局 WebSocket 发送 chat.send
2. server 按 conversationId 查历史
3. server 按 contextTurns 截上下文
4. server 读 settings(模型 / 用户 system prompt)
5. server 拼运行时上下文,组完整 messages
6. server 调 ai
7. ai 通过 `lm.ts` 跟模型走 tool_call ↔ tool_result 循环到 final answer
8. server 把新消息落库
9. server 通过 WebSocket 推送 chat.message / chat.end 等事件
```

边界很清楚:**GUI 发事件 → server 拼上下文 → ai 跑消息并直发模型**。

## 🎯 适合 / 不适合

适合:

- 本地 agent 内核实验
- GUI 优先的 agent
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
