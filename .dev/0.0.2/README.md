# AGENT 0.0.2

## 版本目标

在 0.0.1 的无状态 AI 内核和四工具 Agent 之上，增加本地 Web 对话客户端和持久化服务。

## 新增结构

```text
web/
├── server/          # Node.js HTTP + node:sqlite
│   ├── index.js     # API、SSE、Agent 运行编排
│   ├── db.js        # SQLite 结构和数据访问
│   └── static.js    # 生产前端静态文件
└── ui/              # React + TypeScript + Vite
    └── src/
        ├── App.tsx     # 侧边栏、消息流、输入器
        ├── api.ts      # HTTP 和 SSE 客户端
        └── styles.css  # Sider 风格的精简界面
```

## Web 功能

- 新建、切换和删除对话。
- SQLite 持久化对话、消息、模型上下文和用量。
- 流式显示模型正文。
- 显示 reasoning 和工具调用过程。
- 工具调用展示必填的 `summary`。
- 支持停止当前 Agent 任务。
- 每个对话保留自己的工作目录。
- 跨轮使用 0.0.1 的上下文压缩策略。

## API

```text
GET    /api/health
GET    /api/conversations
POST   /api/conversations
DELETE /api/conversations/:id
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages
POST   /api/conversations/:id/stop
```

`POST /messages` 使用 SSE 返回 AI 内核事件。

## 数据

默认数据库位于 `.data/agent.db`，该目录不进入 Git。数据库开启外键和 WAL，并为对话消息顺序建立索引。

## 运行

```bash
npm --prefix web/ui install
npm run web:build
npm run web
```

默认地址：`http://127.0.0.1:9510`。

## 本版取舍

- 只保留 Sider 的对话布局和交互语言，不引入账号、浏览器、附件、设置中心、国际化或 Electron 逻辑。
- Web 服务只监听 `127.0.0.1`，定位为本地 Agent 界面。
- 模型凭证仍只从被 Git 忽略的根目录 `config.js` 读取，不返回前端。

## 已知限制

- 尚未增加 Web 配置页和工作目录选择器。
- 尚未对工具执行增加人工审批。
- 缺少真实模型凭证时，只能验证 UI、API 和 SQLite，无法完成真实模型端到端对话。
