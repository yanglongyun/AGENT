# 0.0.8 — os:应用宿主

`os/` 是与 `web/`、`desktop/` 平级的第三个宿主，**不是 web 的替代**。它多做一件事：
把 app 当作一等公民装进侧边栏。

```text
CLI ───────────────────┐
Web UI  → Web Server ──┼→ agent → ai → 模型
Desktop → Desktop Srv ─┤
OS UI   → OS Server ───┘
             ↓ spawn / 反代
          app server(独立进程)
```

`ai/` 和 `agent/` 仍然全仓库只有一份，三个宿主 import 同一份内核。
`os/server` 与 `web/server` 高度相似是刻意的：**三个包各自独立演进，改一处不牵动另两处。**

## 核心:app 是独立工程,宿主只消费 dist

app 不是插件，不进宿主的构建，不共享宿主的 React。它是一个碰巧被放在 `os/apps/` 下的
完整工程，有自己的 `package.json`、自己的依赖、自己的构建链。

```text
os/apps/notes/
├── manifest.json      声明文件,宿主读
├── APP.md             提示词,AI 读
├── package.json       自己的依赖,与宿主无关
├── src/               自己的源码,宿主永不进入
├── dist/
│   └── index.html     ← 宿主唯一认的东西
└── server/
    └── index.js       可选
```

**构建的职责没有消失,只是换了执行者。** 宿主运行时零构建职责；而 app 由 AI 写，
AI 手里有 `bash` 工具，`npm run build` 是它在创作时干的事。
于是「AI 用 bash 生产 dist，宿主用 iframe 消费 dist」——生产与消费彻底分离在两个时刻。

`server` 是可选的。manifest 里没有 `server` 字段，supervisor 就不 spawn，
一个纯前端 app（配合宿主 AI 能力）完全成立。

## manifest.json

```json
{
  "id": "notes",
  "name": "便签",
  "icon": "📝",
  "version": "0.1.0",
  "description": "记随手笔记,可让 AI 归纳。用户说记一下 / 有哪些笔记时用它。",
  "entry": "dist/index.html",
  "server": {
    "command": "node",
    "args": ["server/index.js"],
    "health": "/health",
    "idleTimeoutMs": 600000
  },
  "permissions": ["ai.complete"],
  "sidebar": { "order": 20, "hidden": false }
}
```

| 字段 | 说明 |
|---|---|
| `id` | 必须与目录名一致，路由前缀 `/apps/<id>/` |
| `description` | **唯一常驻提示词**的字段，见下节 |
| `entry` | 相对 app 根目录。不存在则该 app 标记 `invalid`，侧边栏灰显并给出原因（最常见的故障是「写完了没构建」，得说清楚，别让人对着白屏猜） |
| `server` | 可选。`command` / `args` / `health` / `idleTimeoutMs` |
| `permissions` | 未声明的宿主能力直接 403，不看 token |
| `sidebar.order` | 侧边栏排序，小的在前；`hidden: true` 装了但不显示 |

## APP.md

纯正文，无 frontmatter——元数据全在 manifest，两个文件不重叠、受众不同：
**manifest 给机器读，APP.md 给模型读。**

注入策略照搬 SKILL.md 的 progressive disclosure：

```text
常驻   每个 app 的 manifest.description 一行,拼成清单进 instructions
按需   AI 用 read 工具读 os/apps/<id>/APP.md 正文
```

20 个 app 的常驻开销也就几百 token。清单里会写明 APP.md 的路径，AI 自己决定何时展开。

APP.md 真正的读者是**未来那个要改这个 app 的 AI**——app 由 AI 写，就一定会被 AI 改，
这是它唯一的交接文档。所以正文里必须写清楚：数据表什么含义、改完要跑什么构建。

## 宿主 spawn

**懒启动**：app 第一次被打开时才 spawn，空闲 `idleTimeoutMs` 后回收。
20 个 app 不等于开机 20 个 node 进程。

```text
cwd   = os/apps/<id>/
env   PORT           宿主分配的空闲端口
      APP_ID
      APP_DATA_DIR   .data/os/apps/<id>/   宿主给路径,app 自己建表
      HOST_URL       http://127.0.0.1:9600
      APP_TOKEN      app 作用域凭证,进程级,每次启动重发
```

用 `PORT` 而不是 unix socket，是因为 app 由 AI 写——`server.listen(process.env.PORT)`
是 Node 生态里最不会写错的一行。socket 隔离更好，等这套跑顺了再换。

健康判定沿用 `scripts/webctl.sh` 的思路：起进程 → 轮询 `health` → 确认应答的就是它。
崩溃退避重启，超过上限标记 `failed`，侧边栏显示故障而不是白屏。

```text
stopped → starting → ready → failed
```

状态经 SSE 推给侧边栏。

**数据库路径宿主给、DDL app 自己建。** 数据放 `.data/os/apps/<id>/` 而不是 app 目录里——
重装或重建 app 不会误删数据，备份也只备一个目录。

## 路由表

```text
GET   /apps/:id/           → os/apps/<id>/dist/index.html   宿主静态
GET   /apps/:id/assets/*   → os/apps/<id>/dist/*            宿主静态
*     /apps/:id/api/*      → 反代到子进程 127.0.0.1:PORT
*     /apps/:id/host/*     → 宿主处理,校验 permissions
GET   /api/apps            → 侧边栏用的 app 列表(含运行状态)
*     /api/*               → 宿主自身(对话 / 设置 / 文件)
```

`api/` 出去、`host/` 回来，前缀一分，双向不打架。

宿主开放给 app 的能力，v1 两个：

```text
GET  /apps/:id/host/me             身份、已授权限、主题
POST /apps/:id/host/ai/complete    单次补全,需 ai.complete 权限
```

`ai.run`（带工具的完整轮次，SSE）留到下一版——它要把 agent 的工作目录、
中止、事件流整套接进 app 的生命周期，不该和第一版混在一起。

## iframe 与凭证

```html
<iframe src="/apps/notes/" sandbox="allow-scripts allow-forms"></iframe>
```

**不给 `allow-same-origin`**——iframe 拿到不透明源，碰不到宿主 DOM，也读不到宿主 cookie。
代价是 app 前端用不了 localStorage / IndexedDB，但这正好和「每个 app 有自己的 SQLite」
一致：**状态归后端，浏览器不留东西。**

不透明源带来两个必然后果，宿主必须配合：

1. app 前端发出的请求 `Origin: null`，是跨源请求。`/apps/:id/api/*` 和
   `/apps/:id/host/*` 都要带 CORS 头并应答 OPTIONS 预检。
2. token 不能放 URL（会进日志和历史）。走 **postMessage 握手**：
   iframe 发 `os.ready`，宿主校验 `event.source === iframe.contentWindow` 后回
   `os.init { token, theme, appId }`。

app server 则直接用 env 里的 `APP_TOKEN`。**能走服务端就走服务端**，
前端拿 token 是给纯静态 app 的退路。

隔离强度在 `config.js` 的 `os.appSandbox` 里，默认 `'allow-scripts allow-forms'`。
少数带注入的浏览器扩展和内嵌预览器会直接拦掉不透明源的子框架（`ERR_BLOCKED_BY_CLIENT`），
那时才在这里补上 `allow-same-origin`。

**被拦的 iframe 照样会触发 `load` 事件**，所以判活不能问前端。宿主改为记录
「这个 app 的页面有没有被真正取走过」（`GET /api/apps/:id/served`），
界面打开 3.5 秒后回头对一次账，没取走就说明被拦了，给出提示和「新标签页打开」。

## 目录

```text
os/
├── server/
│   ├── index.js       入口、路由装配、退出时收子进程
│   ├── api.js         宿主 API(+ /api/apps)
│   ├── apps.js        注册表:扫描、校验、提示词清单
│   ├── supervisor.js  子进程生死:spawn / 健康 / 重启 / 空闲回收
│   ├── proxy.js       /apps/:id/api/* → 子进程
│   ├── bridge.js      /apps/:id/host/* → 宿主能力 + 权限校验
│   ├── store.js       宿主 SQLite
│   ├── runs.js        agent 轮次(+ app 清单注入 instructions)
│   ├── cors.js        不透明源的跨源应答与预检
│   ├── sse.js  files.js  static.js
├── shared/events.js   (+ app.status / apps.changed)
├── ui/                宿主外壳:侧边栏 + iframe 容器
└── apps/              app 装这里
```

## 已知取舍

- `os/server` 与 `web/server` 大面积重复。已知，且是选定的代价：三个包独立。
- app 前端没有浏览器存储（不透明源的必然结果）。
- `os/apps/*/dist` 进 git。宿主不负责构建，dist 不提交则仓库换台机器所有 app 都打不开。
- app server 与宿主同权限运行。app 由 AI 写，这里没有沙箱——和 `bash` 工具是同一个风险面。
