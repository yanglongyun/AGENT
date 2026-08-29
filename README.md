# AGENT

一个以 OpenAI Responses 消息协议为核心、从无状态 AI 循环逐层组合出的本地 Web Agent。

浏览器里的对话界面,加上一套可授权的工具执行、一套用大白话立规则的权限系统,
以及一个能装第三方应用的侧边栏。全部跑在本地,也可以整个部署到服务器上。

## 架构

```text
浏览器 → server → agent → ai → Responses API
                    ↑
                  apps(独立进程)
```

依赖方向始终单向:`server` 调 `agent`,`agent` 调 `ai`。
`ai` 不知道有工具,`agent` 不知道有 HTTP。

```text
AGENT/
├── ai/       无状态循环 + 协议驱动(responses / chat)
├── agent/    bash / read / write / edit / consult、上下文压缩、权限引擎
├── server/   HTTP · SQLite · SSE · 轮次编排 · 问询通道 · 应用宿主
├── shared/   服务端与界面共用的事件名契约
├── ui/       React 客户端
├── apps/     用户的应用,各自是独立工程
└── .dev/     各版本设计与变更说明
```

### 协议驱动

`ai/` 下只有 `drivers/` 认识具体协议,其余(循环、重试、工具执行、事件契约)全是协议无关的。

| 驱动 | 用于 |
|---|---|
| `responses` | OpenAI Responses API(默认) |
| `chat` | 只有 `/chat/completions` 的服务,例如 GLM |

两个驱动之间零依赖,各自消化自己协议的怪癖;**工具循环只有一份**。
驱动接口就是 `attempt()`:进去是统一的 `{ input, instructions, tools }`,
出来是统一的 `{ items, usage, status, stopReason }`,沿途用 `onEvent` 吐增量。

item 词表(`message` / `reasoning` / `function_call` / `function_call_output`)沿用 Responses 那套 ——
它早已是仓库的内部契约:数据库、UI 渲染、上下文压缩全按它来。

## 权限

三档,每次发消息前现场决定,和工作目录并列摆在输入框上:

| 用户看到 | 行为 |
|---|---|
| 逐步确认 | 每次工具调用都停下来问 |
| 按照规则 | 命中任意一条规则就问;都没命中就放行 |
| 完全跳过 | 不问不拦 |

**一条规则 = 一个触发条件。** 用一句大白话写下来,系统把它变成两样东西:

```text
提示词   永远有,靠模型自觉
拦截条件 编译得出才有,由闸保证
```

编译的词汇表是闭集(9 个危险动作 + 4 个工具 + 路径 glob),
所以「这句话能不能落地成闸」**保存那一刻就知道**。编译不出来时界面照实标
「没有拦截条件,只写进提示词」,不许画成拦得住。

审批门挂在**工具调用**上 —— 模型自己写的脚本内部干了什么,它看不见,除非上真沙箱。

### 请示

规则是用户定的条件;请示是助理自己的判断 —— 规则没说到的地方它也能主动问一句。
默认关,在「按照规则」和「完全跳过」两档下可开。它**只能增加摩擦,不能减少**,
也不保证每次都想得起来。卡片上可以勾「同时记成规则」,把一次请示升级成一道常驻的闸。

## 应用

`apps/<id>/` 是一个**完全独立的工程**:自己的 `package.json`、自己的依赖、自己的构建链。
宿主只认 `dist/index.html`,用 iframe 加载,**不参与构建**。

```text
apps/notes/
├── manifest.json   声明文件,宿主读
├── APP.md          提示词,模型读
├── src/  dist/  server/
```

构建的职责没有消失,只是换了执行者:app 由 AI 写,而 AI 手里有 `bash` 工具。
宿主懒启动 app 的后端进程,空闲回收;数据库路径由宿主给,建表由 app 自己做。

## 环境要求

- Node.js 22 或更高版本(项目使用 `node:sqlite`)
- npm
- 一个兼容 OpenAI Responses 或 Chat Completions 的服务

## 安装与运行

```bash
npm ci
npm --prefix ui ci
cp config.example.js config.js
npm run client:build
npm run client
```

默认地址 `http://127.0.0.1:9800`。开发界面用 `npm run client:ui`。

`config.js` 被 Git 忽略,保存工作目录、端口、工具超时、压缩阈值等程序级参数。
驱动、模型、API Key、接口地址和系统提示词**不读环境变量也不读 config.js**,
必须在界面的设置页填写(CLI 除外)。

进程管理(配合 ngrok 之类的远程访问):

```bash
npm run ctl -- start|stop|restart|status|logs
```

## CLI

先在 `config.js` 填好 `responsesUrl`、`apiKey`、`model`,然后:

```bash
npm start
```

输入 `/exit` 退出,`Ctrl+C` 取消当前任务。

## 数据库

| 表 | 职责 |
|---|---|
| `conversations` | 对话元数据、权限档、上下文缓存、最近用量 |
| `messages` | 完整、逐条、不可变的消息和工具事件 |
| `compactions` | 只追加的压缩摘要、覆盖序号、类型和 Token 消耗 |
| `rules` | 用户立的规则:原话、提示词、拦截条件、开关、次序 |
| `settings` | 模型连接、系统提示词、默认权限档 |

app 的数据在各自的库里(`.data/apps/<id>/`),与主库无关。

## 上下文压缩

最近一次用量达到配置水位时,在下一轮开始前压缩早期上下文:

```text
早期上下文 → 模型摘要(失败则机械摘要)→ 系统摘要 + 近期原文
```

原始内容始终保留在 `messages`,每次压缩写入 `compactions`。
规则和应用清单进的是 `instructions`,每轮重新组装,**压缩吃不掉它们**。

## 开发检查

```bash
npm run check
npm test
npm run client:build
```

## 版本说明

各版本设计与变更记录位于 [.dev](./.dev/):

- `0.0.1` 标准 Agent 内核
- `0.0.2` Web 对话原型
- `0.0.3` 工程化 Web 客户端
- `0.0.4` 图片与文件
- `0.0.5` Electron Desktop 与 GUI 设置
- `0.0.6` 可追踪的上下文压缩
- `0.0.7` 内核正确性修复
- `0.0.8` 应用宿主
- `0.0.9` 权限模式
- `0.1.0` 合并成单一 Web 客户端

## License

当前仓库尚未声明开源许可证。
