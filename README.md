# AGENT

一个以 OpenAI Responses 消息协议为核心、从无状态 AI 循环逐层组合出的本地 Agent。

同一份内核可以运行成 CLI、独立 Web 服务或 Electron 桌面客户端。AI 层不感知工具、数据库和界面；宿主按需向上叠加能力。

## 架构

```text
CLI ───────────────────┐
                      │
Web UI → Web Server ───┼→ agent → ai → Responses API
                      │
Desktop UI             │
    ↓                  │
Desktop Server ────────┘
    ↑
Electron Main
```

```text
AGENT/
├── ai/          无状态循环和工具调用调度
│   └── drivers/ 协议驱动:responses / chat,彼此独立
├── agent/       bash、read、write、edit 及上下文压缩
├── web/         可独立部署的 Node.js + React Web 产品
├── desktop/     Electron 本地产品（main、server、ui）
└── .dev/        各版本设计与变更说明
```

### 协议驱动

`ai/` 下只有 `drivers/` 认识具体协议，其余（循环、重试、工具执行、事件契约）全是协议无关的。

| 驱动 | 用于 |
|---|---|
| `responses` | OpenAI Responses API（默认） |
| `chat` | 只有 `/chat/completions` 的服务，例如 GLM |

两个驱动之间零依赖，各自消化自己协议的怪癖；**工具循环只有一份**。
驱动接口就是 `attempt()`：进去是统一的 `{ input, instructions, tools }`，出来是统一的
`{ items, usage, status, stopReason }`，沿途用 `onEvent` 吐增量。

item 词表（`message` / `reasoning` / `function_call` / `function_call_output`）沿用 Responses 那套 ——
它早已是仓库的内部契约：数据库、UI 渲染、上下文压缩全按它来，`ai/` 之外有 40 多处依赖它。
所以 `chat` 驱动负责把 Chat 的形状翻译成它，而不是另立一套。

在 `config.js` 用 `driver` 字段选，或在 Web / Desktop 设置页顶部选。

依赖方向始终是宿主调用 `agent`，`agent` 再调用 `ai`。Web 和 Desktop 拥有各自的服务、UI 和数据库，可以独立演进；`ai` 与 `agent` 在仓库中始终只有一份。

## 当前能力

- OpenAI Responses 流式消息与 reasoning
- 多轮函数调用
- `bash`、`read`、`write`、`edit` 四个工具
- 每次工具调用必须提供 `summary`
- CLI 中断式交互
- Web 与 Desktop 对话、历史记录、置顶、重命名和停止运行
- SQLite 持久化
- 上下文水位压缩和可追踪的压缩记录
- 图片、普通文件、选择、拖拽和剪贴板粘贴
- 图片在请求模型时临时转换为 `input_image`
- GUI 选择驱动，设置模型、API Key、接口地址和系统提示词
- Electron 原生文件与目录选择
- macOS、Windows、Linux 原生窗口标题栏

## 环境要求

- Node.js 22 或更高版本（项目使用 `node:sqlite`）
- npm
- 一个兼容 OpenAI Responses API 的服务

## 安装

```bash
git clone https://github.com/yanglongyun/AGENT.git
cd AGENT
npm ci
npm --prefix web/ui ci
npm --prefix desktop/ui ci
cp config.example.js config.js
```

`config.js` 被 Git 忽略。它保存工作目录、端口、工具超时、压缩阈值等程序级参数。

Web 和 Desktop 的驱动、模型、API Key、接口地址及系统提示词不读取环境变量或 `config.js`，必须在各自 GUI 的设置页面填写。CLI 仍从 `config.js` 读取这些值。

## Web

构建并启动：

```bash
npm run web:build
npm run web
```

默认地址：

```text
http://127.0.0.1:9500
```

开发 UI：

```bash
npm run web:ui
```

Web 数据默认位于：

```text
.data/agent.db
.data/files/
```

浏览器无法可靠取得本地绝对路径，因此选择、拖拽或粘贴的附件先进入受管文件目录。数据库只保存附件元数据和路径，不保存 Base64。

## Desktop

启动 Electron 开发版：

```bash
npm run desktop
```

生成未安装的应用目录：

```bash
npm run desktop:pack
```

生成安装包：

```bash
npm run desktop:dist
```

Desktop 启动自己的随机回环端口，不占用 Web 的 `9500`。SQLite、设置和剪贴板图片副本保存在 Electron `userData` 目录。

通过原生选择器或拖拽加入的文件直接引用原始绝对路径，不上传、不复制；剪贴板截图没有稳定路径，因此保存为 Desktop 受管附件。打包时自动包含 `ai`、`agent` 和 `desktop`，不包含可部署版 `web`。

## CLI

先在 `config.js` 中填写 `responsesUrl`、`apiKey`、`model` 和需要的系统提示词，然后运行：

```bash
npm start
```

- 输入 `/exit` 退出
- 按 `Ctrl+C` 取消当前任务
- 工作目录、bash 策略和压缩策略由 `config.js` 控制

## GUI 设置

Web 与 Desktop 的侧边栏左下角都有独立设置页面，可配置：

- Responses API 地址
- API Key
- 模型 ID
- 系统提示词
- 主题

前四项写入各自 SQLite 的 `settings` KV 表。每次启动一轮 Agent 时读取设置快照，因此修改设置不会改变正在运行的任务。主题是 UI 本地偏好，保存在浏览器存储中。

## 数据库

Web 与 Desktop 使用相同 DDL、不同数据库文件。目前核心表为：

| 表 | 职责 |
|---|---|
| `conversations` | 对话元数据、当前上下文缓存和最近用量 |
| `messages` | 完整、逐条、不可变的 Responses 消息和工具事件 |
| `compactions` | 只追加的压缩摘要、覆盖序号、类型和 Token 消耗 |
| `settings` | GUI 模型连接和 Agent 提示词 KV |

删除对话会通过外键级联删除消息和压缩记录。旧数据库启动时自动补充新表和兼容字段，不需要删库。

## 上下文压缩

当最近一次用量达到配置水位时，Agent 在下一轮开始前压缩早期上下文：

```text
早期上下文 → 模型摘要（失败则机械摘要）→ 系统摘要 + 近期原文
```

- 原始内容始终保留在 `messages`
- 每次压缩写入 `compactions`
- `kind` 区分 `summary` 和 `mechanical`
- `start_seq`、`end_seq` 标记覆盖区间
- `context_json` 只是下一轮运行的快速缓存

## 附件与图片

- 每条消息默认最多 10 个附件
- 单文件默认最大 8 MB
- 支持 PNG、JPEG、GIF、WebP
- `read` 遇到图片时返回图片元数据
- 图片字节只在单次 Responses 请求边界临时展开
- 历史消息和 SQLite 不保存 Base64
- 普通文件以本地路径交给 Agent，再由工具按需读取

相关限制在 `config.js` 的 `images` 中配置。

## 开发检查

```bash
npm run check
npm run web:build
npm run desktop:build-ui
```

## 版本说明

各版本设计与变更记录位于 [.dev](./.dev/)：

- `0.0.1`：标准 Agent 内核
- `0.0.2`：Web 对话原型
- `0.0.3`：工程化 Web 客户端
- `0.0.4`：图片与文件
- `0.0.5`：Electron Desktop 与 GUI 设置
- `0.0.6`：可追踪的上下文压缩

## License

当前仓库尚未声明开源许可证。
