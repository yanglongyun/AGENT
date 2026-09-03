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
├── ai/       Responses API 客户端:请求、读流、重试
├── agent/    循环、工具执行、bash / read / write / edit / confirm、上下文压缩
├── server/   HTTP · SQLite · SSE · 轮次编排 · 规则 · 问询通道 · 应用宿主
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
functions/    bash / read / write / edit / confirm / propose 的实现
tools.js      给模型看的六个工具 schema
compact.js    上下文压缩
```

### server 层

```text
index.js      启动:装配、监听、平滑退出
store.js      SQLite:建表、全部读写
api/          /api/* 路由,每个资源一个文件
http/         sse · static · cors,HTTP 的皮
run/          一轮怎么跑:turn(编排、落库、压缩记账、提议通道)· approvals · files · rules
apps/         应用宿主:registry(扫目录读 manifest)· supervisor(子进程)· bridge(/host/* 契约面)
```

item 词表(`message` / `reasoning` / `function_call` / `function_call_output`)沿用 Responses 那套 ——
它早已是仓库的内部契约:数据库、UI 渲染、上下文压缩全按它来。

## 规则

一张全局的规则单,一个总开关。没有硬闸,没有分组。

**一条规则就是你的一句话**,原样进系统提示词,每轮重装,压缩吃不掉。
它和系统提示词的区别只在于分条、可单独开关、可以由对话沉淀。
"删东西之前先问我"是规则,"回答用中文"也是规则 —— 机制一样,都是常驻指令。

| 总开关 | 行为 |
|---|---|
| 启用 | 规则进提示词;模型有 `confirm` 工具,该问的时候停下来问你 |
| 停用 | 规则不进,没有 `confirm`,不问不拦 |

规则要求先问的,模型调 `confirm` 弹卡等你答复;规则没说到但它自己拿不准的,也这么问。

**规则由对话沉淀。** 用户纠正、补充、驳斥的时候,模型调 `propose` 提议记一条规则
(或改、删已有的一条);提议挂在输入框上方,不阻塞,点勾才落库,点叉丢掉。
同一个通道也能提议下一句话,点了填进输入框,发不发用户定。

首次启动铺五条出厂规则(删除移动、提权格式化、装软件、超出范围、前提有问题),
铺完就是普通规则,可停可删,删了不复活。

这是一场赌:赌模型能遵守用户明写的规则,赌它在该问的时候会问。
正则和词表只能看命令的字面,覆盖面小,却要养一套编译器;与其给人「拦得住」的错觉,
不如把赌注押明白。真正的兜底在文件系统那一层(git、Time Machine、trash 代替 rm),不在这里。

app 触发的轮次没人守着答卡,所以没有 `confirm`;规则照样进提示词,不随总开关关掉。

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
首批生态应用:[notes](https://github.com/yanglongyun/notes)(笔记)、[board](https://github.com/yanglongyun/board)(看板)、[canvas](https://github.com/yanglongyun/canvas)(画布)、[mindmap](https://github.com/yanglongyun/mindmap)(思维导图)、[ramify](https://github.com/yanglongyun/ramify) —— 各自是独立仓库,克隆进 `apps/` 即装。

## 环境要求

- Node.js 22 或更高版本(项目使用 `node:sqlite`)
- npm
- 一个兼容 OpenAI Responses API 的服务

## 安装与运行

```bash
npm ci
npm --prefix ui ci
cp config.example.js config.js
npm run client:build
npm run client
```

默认地址 `http://127.0.0.1:9500`。开发界面用 `npm run client:ui`。

`config.js` 被 Git 忽略,保存工作目录、端口、工具超时、压缩阈值等程序级参数。
模型、API Key、接口地址和系统提示词**不读环境变量也不读 config.js**,
必须在界面的设置页填写。

进程管理(配合 ngrok 之类的远程访问):

```bash
npm run ctl -- start|stop|restart|status|logs
```

## 数据库

| 表 | 职责 |
|---|---|
| `conversations` | 对话元数据、上下文缓存、最近用量 |
| `messages` | 完整、逐条、不可变的消息和工具事件 |
| `compactions` | 只追加的压缩摘要、覆盖序号、类型和 Token 消耗 |
| `rules` | 用户的规则:原话、开关、次序 |
| `proposals` | 模型放到用户面前、还没点的提议 |
| `settings` | 模型连接、系统提示词、规则总开关 |

app 的数据在各自的库里(`.data/apps/<id>/`),与主库无关。

## 上下文压缩

模型每次应答都带 usage,存下来就是当前水位。**每次请求前**都看一眼,超线就先压再发 ——
工具循环才是上下文增长的大头,压缩落在循环里,不只在一轮开头:

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
- `0.1.1` 应用契约标准化
- `0.1.2` 让标准活起来
- `0.1.3` 底层清晰化:架构
- `0.1.4` 护盾改成规则
- `0.1.5` 项目与提议

## License

[MIT](./LICENSE)。契约(SPEC.md)欢迎任何宿主与 app 实现。
