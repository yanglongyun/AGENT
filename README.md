# Agent Chat 🤖

> 本地优先的 Agent 对话应用:流式对话、WebSocket 运行时、shell 工具、本地文件附件。

一个跑在你自己机器上的 AI 工作台。对话实时流式呈现,AI 可以直接在本机执行 shell、读写文件、跑后台任务,数据全部落在本地 SQLite,不依赖任何云端后端。接任意 OpenAI 兼容接口(OpenAI / DeepSeek / Kimi / Gemini…)。

## 亮点

- **流式对话** —— 逐字实时输出,基于 WebSocket 的运行时,支持中断。
- **shell 工具** —— AI 用 `shell` 在本机执行任意命令(建目录、跑构建、查状态),无沙箱,直接作用于你的工作目录。
- **本地文件附件** —— 上传文件交给 AI 分析、整理、转换。
- **后台任务** —— 慢活、可并行或需稍后回报的工作丢到后台异步执行,保留提示词 / 状态 / 结果。
- **订阅** —— 后台任务完成后,结果作为新消息回投到对应对话并唤醒它继续处理。
- **记忆** —— 跨对话复用的长期事实与指令。
- **技能** —— 本地指令包,教 AI 如何处理特定工作流,自动注入提示词。
- **控制** —— 通过连接器接管浏览器(browser-use)与电脑(computer-use)。
- **成长** —— 沉淀 AI 在运行中学到的长期行为更新。
- **可配置** —— 服务商 / 模型 / API 地址 / 系统提示词 / 主题 / 语言,均在「设置」里调。

## 技术栈

- **后端**:Node.js(原生 `http` + `ws`,无框架),`node:sqlite` 持久化,OpenAI 兼容的流式 LLM 调用。
- **前端**:Vue 3 + Vite + Tailwind CSS v4,Lucide 图标。
- **存储**:单文件 SQLite(`data/agent.db`),承载对话、消息、任务、订阅、记忆、更新。

## 直接下载（无需安装 Node.js）

| 系统 | 下载 | 使用方式 |
|---|---|---|
| Windows 10/11 x64 | [AgentChat-windows-x64.zip](https://gitee.com/realuckyang/agent/releases/download/v1.0.0/AgentChat-windows-x64.zip) | 解压后双击 `AgentChat.exe`，使用期间保持命令窗口打开 |
| macOS 11+ Apple Silicon | [AgentChat-macos-arm64.zip](https://gitee.com/realuckyang/agent/releases/download/v1.0.0/AgentChat-macos-arm64.zip) | 解压后将 `Agent Chat.app` 拖入“应用程序”并打开 |

程序启动后会在本机 `127.0.0.1:9500` 运行服务并自动打开浏览器。首次使用请在“设置”中填写模型 API Key。重复双击会打开已在运行的实例，不会创建第二份数据。

> 发布包尚未使用商业代码签名证书。Windows SmartScreen 可能显示“未知发布者”；macOS 首次打开可能需要右键应用并选择“打开”。可使用 [SHA256SUMS.txt](https://gitee.com/realuckyang/agent/releases/download/v1.0.0/SHA256SUMS.txt) 校验下载文件。

打包版数据存储位置：

- Windows：`%APPDATA%\Agent Chat`
- macOS：`~/Library/Application Support/Agent Chat`

浏览器控制功能仍需单独安装 `extension/` 中的 Chrome 扩展。

## 快速开始

> 需要 Node.js ≥ 22(用到实验特性 `node:sqlite`)。

```bash
# 1. 安装依赖
npm install

# 2. 配置模型(复制后填入你的 API Key)
cp .env.example .env

# 3a. 开发模式:后端 + 前端热更各起一个
npm run server      # 后端,默认 http://127.0.0.1:9500
npm run ui          # 前端开发服务器(Vite),代理 /api、/ws 到后端

# 3b. 生产模式:打包后由后端直接托管
npm run build       # 产物到 dist/
npm run server      # 访问 http://127.0.0.1:9500
```

### 配置项(`.env`）

| 变量 | 说明 | 默认 |
|---|---|---|
| `AGENT_PORT` | 后端端口 | `9500` |
| `LLM_PROVIDER` | 服务商标识 | `openai` |
| `LLM_API_URL` | OpenAI 兼容的 chat completions 地址 | `https://api.openai.com/v1/chat/completions` |
| `LLM_API_KEY` | API 密钥 | — |
| `LLM_MODEL` | 模型名 | `gpt-4.1-mini` |

> 这些也可以在应用内「设置」里改,设置会持久化到数据库。

## 项目结构

```
server/
  index.js          # HTTP + 静态托管入口
  api/              # REST 路由(chat / tasks / subscriptions / memories / skills / controls / settings / fs …)
  ai/               # LLM 调用(llm.js)、工具(shell)、runner、vision
  service/          # 业务逻辑(chat、growth、skills、models…)
    controls/computer-use/  #   电脑控制(进程内执行)
  repository/       # SQLite 数据访问(db.js 建表)
  ws/               # 所有 socket 业务:chat(聊天流)+ extension(浏览器扩展桥)
  utils/
ui/
  App.vue           # 布局:侧栏 + 主区
  views/            # 页面级视图:Chat / Tasks / Subscriptions / Memories / Skills / Controls / Growth / Settings
  components/       # 复用构件:Sidebar / Composer / Messages / History / bubbles
  lib/              # api、ws、stream、markdown、locale、appearance
  styles/           # Tailwind 分层样式
extension/          # 浏览器控制连接器(Chrome 扩展,WS 连入 AGENT)
```

## ⚠️ 安全提示

`shell` 工具在**你本机**执行任意命令,**无沙箱** —— 这是本地 agent 工具的常态。只在你信任的机器、对你信任的模型使用。

浏览器扩展使用 `debugger`、`tabs`、`scripting` 和 `<all_urls>` 等高权限来读取、操作当前浏览器会话。它默认只连接本机 AGENT 服务；不要将未经身份验证的服务暴露到公网，也不要在含敏感账号会话的浏览器中使用不可信模型。更多报告方式见 [SECURITY.md](SECURITY.md)。

## 贡献

欢迎提交 Issue 和 Pull Request。开始之前请阅读 [贡献指南](CONTRIBUTING.md) 和 [行为准则](CODE_OF_CONDUCT.md)。项目变更记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

本项目使用 [MIT License](LICENSE) 开源。
