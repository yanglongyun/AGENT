# Core

一个最小的本地 AI 对话助手:一个对话窗口,一个能调用 `shell` 的工具循环。

模型可以正常回答问题;当需要查看文件、执行命令或处理本地开发工作时,它会调用 `shell` 工具,把结果带回对话里继续。所有消息存在本地 SQLite,刷新页面历史还在。

## 配置

模型配置和系统提示词在**应用内设置**里填,存进数据库(`settings` 表),没有配置文件。

启动后打开页面右上角齿轮,填写:

| 字段 | 说明 |
|---|---|
| 接口地址 | OpenAI 兼容的 chat completions 地址 |
| API Key | 密钥 |
| 模型 | 模型名 |
| 厂商 | 鉴权头标识(`openai` / `deepseek` / `claude`,默认 `openai`) |
| 系统提示词 | 留空则用内置默认 |

服务端口可用环境变量 `AGENT_PORT` 覆盖,默认 `9500`。

## 启动

```bash
npm run build    # 编译前端到 dist/
npm run server   # 启动服务,托管前端
```

打开 http://127.0.0.1:9500 ,在右上角设置里填好模型即可开始对话。

开发前端时可用 `npm run ui` 启 dev server(热更新),它会把接口代理到后端。

## 结构

```
server/
  index.js     HTTP + WebSocket + 静态托管
  ws.js        WebSocket:对话消息与中断
  chat.js      对话循环:读历史 → 追加输入 → 跑工具循环 → 落库 → 推流
  db.js        SQLite,messages 表 + settings 表
  messages.js  消息读写
  settings.js  设置 KV 读写(模型配置 + 提示词)
  prompt.js    系统提示词(取设置里的自定义,留空用默认)
  config.js    从 settings 表取运行配置
  http.js      HTTP 辅助(JSON 响应 / 读 body / 静态托管)
  ai/
    index.js     工具调用循环(历史原样拼接发送,不做加工)
    llm.js       流式 LLM 调用(SSE 解析)
    runner.js    执行工具调用
    tools.js     工具声明(shell)
    functions.js 工具实现(shell:子进程执行,带超时与中断)
ui/
  App.vue      对话窗口
  components/  消息列表 / 输入框 / 气泡
  lib/         WebSocket 客户端 / 流式渲染 / Markdown
```

## WebSocket 事件

对话全程走 `/ws`,JSON 消息,字段 `type` 区分事件。

**客户端 → 服务端**

| type | 字段 | 含义 |
|---|---|---|
| `ping` | — | 心跳 |
| `chat.message` | `prompt` | 发一条消息,触发一轮对话循环 |
| `chat.abort` | — | 中断当前进行中的循环 |

**服务端 → 客户端**

| type | 字段 | 含义 |
|---|---|---|
| `socket.connected` | — | 连接建立 |
| `pong` | — | 心跳回应 |
| `input` | `message` | 用户消息已入库(回显) |
| `start` | — | 本轮循环开始 |
| `message` | `content` | 助手回复的流式增量(可多次) |
| `tool_calls` | `toolCalls` | 模型发起工具调用 |
| `tool_results` | `results` | 工具执行结果(`[{ toolCallId, content }]`) |
| `done` | — | 本轮结束 |
| `error` | `content` | 出错(如未配置模型、接口报错) |
| `aborted` | — | 已被中断 |
| `socket.error` | `content` | 协议层错误(JSON 解析失败 / 未知 type) |

一轮典型对话的事件序列:
`input → start → (message×N | tool_calls → tool_results)×N → done`

## 技术栈

Node.js(内置 `node:sqlite`,无需额外数据库)· Vue 3 · Vite · Tailwind CSS · WebSocket。
