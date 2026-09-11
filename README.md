# AGENT

一个以 OpenAI Responses 消息协议为核心、从无状态 AI 循环逐层组合出的本地 Web Agent。

浏览器里的聊天与任务界面、工具执行和确认卡，以及一个能装第三方应用的侧边栏。全部跑在本地,也可以整个部署到服务器上。

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
├── ai/       Responses API 客户端:请求、读流、重试
├── agent/    循环、工具执行、shell / read / write / edit / confirm、上下文压缩
├── server/   HTTP · SQLite · SSE · 轮次编排 · 问询通道 · 应用宿主
├── shared/   服务端与界面共用的事件名契约
├── ui/       React 客户端
├── apps/     用户的应用,各自是独立工程
└── .dev/     各版本设计与变更说明
```

### ai 层

只认 OpenAI Responses API,一个协议、一条路。发一次请求,拿回一次结果,不认识循环和工具:

```text
request.js    一次请求 = attempt + 重试
responses.js  发请求、读 SSE 流、解析成 { items, usage, status, stopReason }
retry.js      哪些错误值得再试、退避多久
complete.js   无工具的单次补全(标题、摘要用)
```

### agent 层

循环住在这里 —— agent 就是「模型 → 工具 → 模型」这个动作:

```text
index.js      循环:请求 → 有 function_call 就交给 runner → 再请求。给了 ask 才把 confirm 发给模型
runner.js     执行一次 function_call
functions/    shell / read / write / edit / confirm 的实现
tools.js      给模型看的五个工具 schema
compact.js    上下文压缩
```

### server 层

```text
index.js      启动:装配、监听、平滑退出
store.js      SQLite:建表、全部读写
api/          /api/* 路由,每个资源一个文件
http/         sse · static · cors,HTTP 的皮
run/          一轮怎么跑:turn(编排、落库、压缩记账)· approvals · files
apps/         应用宿主:registry(扫目录读 manifest)· supervisor(子进程)· bridge(/host/* 契约面)
```

item 词表(`message` / `reasoning` / `function_call` / `function_call_output`)沿用 Responses 那套 ——
它早已是仓库的内部契约:数据库、UI 渲染、上下文压缩全按它来。

## 聊天与任务

聊天保存在 `chats`，任务保存在 `tasks`。两者共用 `messages` 和 `compactions`，通过全局唯一的 `thread` ID 关联。
用户只创建聊天。任务仅由 Apps 调用宿主模型能力时创建，界面用于查看执行过程及取消任务，不提供任务输入框或用户继续执行入口。
任务状态由执行流程维护；服务中断的任务会标为暂停，用户可以取消任务。

所有 Agent 工具统一在 **AGENT 项目根目录** 运行，不提供按聊天或任务切换目录的选项。
聊天保留 `confirm` 工具，模型需要用户确认时可暂停等待答复；App 任务不提供确认卡。
对话标题栏最右侧的面板入口可编辑全局提示词和本对话规则。全局提示词由所有对话共用；本对话规则以整段文本保存在 `chats.rules`，每轮请求重新读取并与全局提示词组合。新对话规则默认留空，可在首条消息发送前填写。规则不再逐条管理。`propose` 异步展示在输入框上方，点击查看详情；规则提议使用 old_text/new_text 精确编辑，支持新增、修改和删除；同意时重新校验原文，冲突不应用，同意后续问题提议只填入草稿，忽略则不执行。提议随消息持久化，刷新后仍可处理。

## 应用

app 是一个目录,里面是一个**本地网站**:自己监听宿主分配的端口,自己应答页面和 API。
每个 app 一个真 origin;语言、框架、构不构建全是作者的自由。契约正典见仓库根 [SPEC.md](./SPEC.md)。

```text
apps/notes/
├── manifest.json   声明:是什么、怎么跑、要什么
├── APP.md          文档:API 表、数据、什么时候用 —— 给模型读
├── icon.svg        可选,没有就用字母头像
└── (实现)          随便什么语言、框架、构建方式
```

宿主管生命周期(懒启动 / 常驻 / 空闲回收 / 崩溃重启)和取址;
app 可凭 token 调宿主能力(`/host/ai/complete`、`/host/ai/agent`、`/host/notify`);
agent 读 APP.md 后直接用 HTTP 调 app —— 文档即 SDK。
项目自带三个初始应用，源码和构建产物都在 `apps/` 中，启动 AGENT 后自动列在侧边栏，点开时启动：

| 应用 | 目录 | 数据目录 |
|---|---|---|
| 导图 | `apps/mindmap` | `.data/apps/mindmap` |
| 笔记 | `apps/notes` | `.data/apps/notes` |
| 创意 | `apps/ramify` | `.data/apps/ramify` |

这三个应用的已有构建产物可以直接运行，不需要额外安装依赖。修改应用源码后，按各自 APP.md 的命令重建。
Ramify 的生成请求通过 `/host/ai/complete` 使用设置中的模型，并在任务列表留存。方向规划要求模型支持 `text.format` 结构化输出。
原应用的数据不会自动导入；所有初始应用从本项目各自的数据目录开始。


## 环境要求

- Node.js 22 或更高版本(项目使用 `node:sqlite`)
- npm
- 一个兼容 OpenAI Responses API 的服务

## 安装与运行

```shell
npm ci
npm --prefix ui ci
cp config.example.js config.js
npm run build
npm start
```

默认地址 `http://127.0.0.1:9500`。开发界面用 `npm run dev`。

`config.js` 被 Git 忽略,保存端口、工具超时、压缩阈值等程序级参数。
模型、API Key、接口地址和系统提示词**不读环境变量也不读 config.js**,
必须在界面的设置页填写。

启动后日志直接显示在终端,按 `Ctrl+C` 停止服务。重新执行 `npm start` 即可启动。

## 数据库

| 表 | 职责 |
|---|---|
| `chats` | 聊天标题、整段规则、置顶、上下文、最近用量 |
| `tasks` | 任务标题、状态、上下文、最近用量和结束时间 |
| `messages` | 完整消息，以全局自增 `id` 排序和分页，以 `thread` 归属 |
| `compactions` | 模型摘要、覆盖的起止消息 ID、摘要输出 token 数 |
| `settings` | 模型连接和系统提示词等全局设置 |

完整带注释的 DDL 见 `server/schema.sql`。SQLite 自带的 `sqlite_sequence` 是自增计数器，不是业务表。
旧数据库首次启动时自动生成 `.backup` 一致性备份，再在事务中迁移：保留聊天、消息、模型摘要及设置，删除规则和提议表。
历史机械裁剪不计作模型摘要，其消息原文仍保留在历史中，旧规则及提议可从备份恢复。
`thread` 的跨表唯一性、消息归属和删除清理由存储层事务保证。删除运行中的 thread 会先停止并等待收尾。

app 的数据在各自的库里(`.data/apps/<id>/`),与主库无关。

## 上下文压缩

模型每次应答都带 usage,存下来就是当前水位。**每次请求前**都看一眼,超线就先压再发 ——
工具循环才是上下文增长的大头,压缩落在循环里,不只在一轮开头:

```text
早期上下文 → 模型摘要 → 摘要 + 近期原文
```

原始内容始终保留在 `messages`，摘要、压缩范围和更新后的上下文在同一事务提交。
摘要请求失败、输出不完整或内容过短时直接报错，保留原始上下文，不使用机械裁剪。
全局提示词、本对话规则和应用清单进的是 `instructions`,每轮重新组装,**压缩吃不掉它们**。

## 开发检查

```shell
npm run check
npm test
npm run build
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
- `0.1.1` 应用契约标准化
- `0.1.2` 让标准活起来
- `0.1.3` 底层清晰化:架构
- `0.1.4` 护盾改成规则
- `0.1.5` 项目与提议
- `0.1.6` 对话规则、应用任务与三个初始应用
- `0.1.7` 提议作为待确认的编辑

## License

[MIT](./LICENSE)。契约(SPEC.md)欢迎任何宿主与 app 实现。
